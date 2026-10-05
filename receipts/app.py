"""Kassenbon: scan German supermarket receipts and track spending.

Run from the receipts/ folder:  streamlit run app.py
"""

import os
from datetime import date

import altair as alt
import pandas as pd
import streamlit as st
from dotenv import set_key

from receipt_extractor import ExtractionError, LineType, validate_receipt
from receipt_extractor import analytics as an
from receipt_extractor import app_support as support
from receipt_extractor.extractor import DEFAULT_MODEL, MIME_TYPES
from receipt_extractor.settings import PACKAGE_ROOT, env_api_key, load_env
from receipt_extractor.store import ReceiptStore

load_env()  # GEMINI_API_KEY / GEMINI_MODEL / RECEIPTS_DB from receipts/.env, if present
ENV_FILE = PACKAGE_ROOT / ".env"

st.set_page_config(page_title="Kassenbon", page_icon="🧾", layout="wide")

st.markdown(
    """
    <style>
      .block-container { padding-top: 2rem; max-width: 1200px; }
      [data-testid="stMetric"] {
        background: var(--secondary-background-color);
        border: 1px solid rgba(128, 128, 128, 0.18);
        border-radius: 14px;
        padding: 14px 18px;
      }
      [data-testid="stMetricLabel"] p { font-size: 0.85rem; opacity: 0.75; }
      .kb-subtitle { opacity: 0.7; margin-top: -0.6rem; margin-bottom: 1.4rem; }
      .kb-pill {
        display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.8rem; font-weight: 600;
      }
      .kb-ok { background: rgba(16, 185, 129, 0.15); color: rgb(5, 150, 105); }
      .kb-review { background: rgba(245, 158, 11, 0.18); color: rgb(180, 83, 9); }
    </style>
    """,
    unsafe_allow_html=True,
)

LINE_TYPE_LABELS = {
    LineType.PRODUCT.value: "Product",
    LineType.DEPOSIT.value: "Pfand",
    LineType.DEPOSIT_RETURN.value: "Leergut",
    LineType.DISCOUNT.value: "Discount",
    LineType.OTHER.value: "Other",
}
CHART_COLOR = "#0d9488"  # readable on both light and dark backgrounds


@st.cache_resource
def get_store() -> ReceiptStore:
    return ReceiptStore()


@st.cache_resource(show_spinner=False)
def get_extractor(model: str, api_key: str, fallback: str):
    return support.build_extractor(model, api_key, fallback)


def current_api_key() -> tuple[str | None, str]:
    """(key, source): the key typed in the sidebar wins over .env / the environment."""
    return support.resolve_api_key(st.session_state.get("api_key_input"), env_api_key())


def header(title: str, subtitle: str) -> None:
    st.title(title)
    st.markdown(f"<p class='kb-subtitle'>{subtitle}</p>", unsafe_allow_html=True)


def status_pill(needs_review: bool) -> str:
    if needs_review:
        return "<span class='kb-pill kb-review'>Needs review</span>"
    return "<span class='kb-pill kb-ok'>Checked</span>"


def items_column_config() -> dict:
    return {
        "raw_text": st.column_config.TextColumn("Printed text", width="medium"),
        "name": st.column_config.TextColumn("Product", width="medium"),
        "line_type": st.column_config.SelectboxColumn(
            "Type", options=list(LINE_TYPE_LABELS), format_func=LINE_TYPE_LABELS.get, required=True, width="small"
        ),
        "quantity": st.column_config.NumberColumn("Qty", format="%.3g", width="small"),
        "unit": st.column_config.SelectboxColumn("Unit", options=["pcs", "kg", "g", "l"], width="small"),
        "unit_price": st.column_config.NumberColumn("Unit price", format="%.2f €", width="small"),
        "total_price": st.column_config.NumberColumn("Total", format="%.2f €", required=True, width="small"),
        "vat_code": st.column_config.TextColumn("VAT", width="small"),
    }


# --- Scan ------------------------------------------------------------------------------------------------


def scan_page() -> None:
    header("Scan a receipt", "Upload or photograph a German supermarket receipt. Gemini reads it, you check it, then save.")

    api_key, _ = current_api_key()
    if not api_key and "draft" not in st.session_state:
        st.info(
            "Add your Gemini API key to extract receipts: paste it in the sidebar, or put `GEMINI_API_KEY=...` "
            "in `receipts/.env`. Get a free key at https://aistudio.google.com/apikey.",
            icon="🔑",
        )

    if "draft" in st.session_state:
        review_draft(st.session_state["draft"])
        return

    upload_tab, camera_tab = st.tabs(["📁 Upload", "📷 Camera"])
    with upload_tab:
        uploaded = st.file_uploader(
            "Receipt photo or PDF", type=[ext.lstrip(".") for ext in MIME_TYPES], label_visibility="collapsed"
        )
    with camera_tab:
        photo = st.camera_input("Take a photo of the receipt", label_visibility="collapsed")

    source = uploaded or photo
    if source is None:
        st.caption("Tip: lay the receipt flat, fill the frame and avoid shadows. Long receipts can be uploaded as one photo.")
        return

    left, right = st.columns([1, 1], gap="large")
    with left:
        show_image(source.getvalue(), source.type, source.name)
    with right:
        st.markdown(f"**{source.name}**  \n{len(source.getvalue()) / 1024:.0f} KB")
        if st.button("Extract receipt", type="primary", icon="✨", width="stretch", disabled=not api_key):
            extract(source.getvalue(), source.type or "image/jpeg", source.name)


def show_image(data: bytes, mime_type: str | None, name: str) -> None:
    if mime_type == "application/pdf":
        st.info(f"📄 {name} (PDF preview not shown)")
        return
    try:
        st.image(data, width="stretch")
    except Exception:  # e.g. HEIC, which browsers cannot display
        st.info(f"🖼️ {name} (preview not available for this format)")


def extract(data: bytes, mime_type: str, name: str) -> None:
    model = st.session_state.get("model", DEFAULT_MODEL)
    fallback = st.session_state.get("fallback_model", "")
    api_key, _ = current_api_key()
    notice = st.empty()

    def show_retry(model_name: str, attempt: int, delay: float, code: int) -> None:
        reason = "rate limit reached" if code == 429 else "Google's servers are busy"
        notice.info(f"Gemini `{model_name}`: {reason} ({code}). Retrying in {delay:g}s (retry {attempt})…", icon="⏳")

    with st.spinner("Reading the receipt…"):
        try:
            extractor = get_extractor(model, api_key or "", fallback)
            extractor.on_retry = show_retry
            result = extractor.extract(data, mime_type)
        except ExtractionError as exc:
            notice.empty()
            st.error(f"Could not read this receipt: {exc}", icon="⚠️")
            return
        except Exception as exc:  # missing API key, network problems
            st.error(f"Gemini is not available: {exc}", icon="⚠️")
            return
    st.session_state["draft"] = {
        "id": st.session_state.get("draft_counter", 0) + 1,
        "receipt": result.receipt,
        "model": result.model,
        "attempts": result.attempts,
        "image": data,
        "mime_type": mime_type,
        "name": name,
    }
    st.session_state["draft_counter"] = st.session_state["draft"]["id"]
    st.rerun()


def review_draft(draft: dict) -> None:
    base = draft["receipt"]
    key = f"draft{draft['id']}"
    store = get_store()

    left, right = st.columns([2, 3], gap="large")
    with left:
        show_image(draft["image"], draft["mime_type"], draft["name"])
        st.caption(f"Read by {draft['model']} · {draft['attempts']} attempt(s)")

    with right:
        c1, c2 = st.columns(2)
        store_name = c1.text_input("Store", value=base.store_name, key=f"{key}_store")
        purchase_date = c2.date_input("Date", value=support.parse_date(base.date), format="DD.MM.YYYY", key=f"{key}_date")
        c3, c4, c5 = st.columns(3)
        time = c3.text_input("Time", value=base.time or "", placeholder="HH:MM", key=f"{key}_time")
        payment = c4.text_input("Payment", value=base.payment_method or "", key=f"{key}_payment")
        total = c5.number_input("Total (€)", value=float(base.total), step=0.01, format="%.2f", key=f"{key}_total")
        # Filled in after the line-item editor below has run, so the check reflects the latest edits.
        status = st.container()

    st.subheader("Line items")
    st.caption("Click a cell to correct it. Add or delete rows at the bottom and left of the table.")
    edited = st.data_editor(
        pd.DataFrame(support.items_to_rows(base), columns=support.ITEM_COLUMNS),
        column_config=items_column_config(),
        num_rows="dynamic",
        width="stretch",
        hide_index=True,
        key=f"{key}_items",
    )

    receipt, problems = support.rows_to_receipt(
        edited.to_dict("records"),
        store_name=store_name,
        purchase_date=purchase_date,
        time=time,
        total=total,
        payment_method=payment,
        base=base,
    )

    with status:
        if problems:
            st.error("Fix these before saving:\n" + "\n".join(f"- {p}" for p in problems), icon="✏️")
            issues = problems
        else:
            issues = validate_receipt(receipt).issues
            items_sum = sum(item.total_price for item in receipt.line_items)
            m1, m2, m3 = st.columns(3)
            m1.metric("Lines", len(receipt.line_items))
            m2.metric("Lines add up to", support.euro(items_sum))
            m3.metric("Receipt total", support.euro(receipt.total))
            if issues:
                st.warning(
                    "Some checks failed. Compare with the photo and correct the values, or save it marked for review:\n"
                    + "\n".join(f"- {issue}" for issue in issues),
                    icon="🔎",
                )
            else:
                st.success("All checks passed: the lines add up to the total.", icon="✅")

            duplicate = store.find_duplicate(receipt)
            if duplicate:
                st.warning(f"A receipt from the same store, date, time and total is already saved (#{duplicate}).", icon="📎")

        b1, b2 = st.columns(2)
        label = "Save receipt" if not issues else "Save for review"
        if b1.button(label, type="primary", icon="💾", disabled=receipt is None, width="stretch"):
            receipt_id = store.save(receipt, issues, model=draft["model"], image_name=draft["name"])
            del st.session_state["draft"]
            st.toast(f"Saved receipt #{receipt_id} · {support.euro(receipt.total)}", icon="✅")
            st.rerun()
        if b2.button("Discard", icon="🗑️", width="stretch"):
            del st.session_state["draft"]
            st.rerun()


# --- Receipts --------------------------------------------------------------------------------------------


def receipts_page() -> None:
    header("Receipts", "Everything you have saved. Select a row to see its line items.")
    store = get_store()
    receipts = store.list_receipts()
    if not receipts:
        st.info("No receipts yet. Scan your first one on the **Scan** page.", icon="🧾")
        return

    df = pd.DataFrame(receipts)
    stores = sorted(df["store_name"].str.upper().unique())
    f1, f2 = st.columns([2, 1])
    chosen = f1.multiselect("Store", stores, placeholder="All stores")
    only_review = f2.toggle("Only needs review")
    if chosen:
        df = df[df["store_name"].str.upper().isin(chosen)]
    if only_review:
        df = df[df["needs_review"]]

    table = pd.DataFrame(
        {
            "Date": pd.to_datetime(df["date"], errors="coerce"),
            "Time": df["time"],
            "Store": df["store_name"],
            "Total": df["total"],
            "Payment": df["payment_method"],
            "Status": df["needs_review"].map({True: "⚠️ Needs review", False: "✅ Checked"}),
        }
    )
    event = st.dataframe(
        table,
        hide_index=True,
        width="stretch",
        on_select="rerun",
        selection_mode="single-row",
        column_config={
            "Date": st.column_config.DateColumn(format="DD.MM.YYYY"),
            "Total": st.column_config.NumberColumn(format="%.2f €"),
        },
        key="receipts_table",
    )
    st.caption(f"{len(table)} receipt(s) · {support.euro(float(df['total'].sum()))}")

    selected = event.selection.rows if event and event.selection else []
    if selected:
        receipt_detail(store, int(df.iloc[selected[0]]["id"]))


def receipt_detail(store: ReceiptStore, receipt_id: int) -> None:
    found = store.get(receipt_id)
    if found is None:
        return
    meta, receipt = found
    st.divider()
    st.markdown(
        f"### {receipt.store_name} · {support.euro(receipt.total)} &nbsp; {status_pill(meta['needs_review'])}",
        unsafe_allow_html=True,
    )
    when = support.parse_date(receipt.date)
    st.caption(
        " · ".join(
            part
            for part in (
                when.strftime("%d.%m.%Y") if when else None,
                receipt.time,
                receipt.payment_method,
                receipt.store_address,
                f"from {meta['image_name']}" if meta["image_name"] else None,
            )
            if part
        )
    )
    for issue in meta["issues"]:
        st.warning(issue, icon="🔎")

    # Read-only view: format as text so empty cells stay blank instead of showing "None".
    items = pd.DataFrame(
        [
            {
                "Printed text": i.raw_text,
                "Product": i.name,
                "Type": LINE_TYPE_LABELS[i.line_type.value],
                "Qty": f"{i.quantity:g} {i.unit or ''}".strip() if i.quantity is not None else "",
                "Unit price": support.euro(i.unit_price) if i.unit_price is not None else "",
                "Total": support.euro(i.total_price),
                "VAT": i.vat_code or "",
            }
            for i in receipt.line_items
        ]
    )
    st.dataframe(items, hide_index=True, width="stretch")

    with st.popover("Delete receipt", icon="🗑️"):
        st.write("This permanently removes the receipt and its lines.")
        if st.button("Yes, delete", type="primary", key=f"delete_{receipt_id}"):
            store.delete(receipt_id)
            st.toast("Receipt deleted", icon="🗑️")
            st.rerun()


# --- Dashboard -------------------------------------------------------------------------------------------


def dashboard_page() -> None:
    header("Spending", "Where your supermarket money goes.")
    store = get_store()
    receipts = an.receipts_frame(store.list_receipts())
    if receipts.empty:
        st.info("Your dashboard fills in as you save receipts.", icon="📊")
        return
    items = an.items_frame(store.all_line_items())

    o = an.overview(receipts, today=date.today())
    change = o["this_month"] - o["last_month"]
    m1, m2, m3, m4 = st.columns(4)
    m1.metric(
        "This month",
        support.euro(o["this_month"]),
        delta=f"{support.euro(change)} vs last month" if o["last_month"] else None,
        delta_color="inverse",
    )
    m2.metric("All time", support.euro(o["total_spent"]))
    m3.metric("Receipts", o["receipts"])
    m4.metric("Average receipt", support.euro(o["avg_receipt"]))
    if o["needs_review"]:
        st.caption(f"⚠️ {o['needs_review']} receipt(s) are marked for review; their numbers may be off.")

    left, right = st.columns([3, 2], gap="large")
    with left:
        st.subheader("Per month")
        monthly = an.monthly_totals(receipts)
        monthly["label"] = pd.to_datetime(monthly["month"]).dt.strftime("%b %Y")
        st.altair_chart(
            alt.Chart(monthly)
            .mark_bar(cornerRadiusTopLeft=6, cornerRadiusTopRight=6, color=CHART_COLOR)
            .encode(
                x=alt.X("label:N", title=None, sort=None, axis=alt.Axis(labelAngle=0)),
                y=alt.Y("total:Q", title="€"),
                tooltip=[
                    alt.Tooltip("label:N", title="Month"),
                    alt.Tooltip("total:Q", title="Spent €", format=".2f"),
                    alt.Tooltip("receipts:Q", title="Receipts"),
                ],
            )
            .properties(height=280),
            width="stretch",
        )
    with right:
        st.subheader("By store")
        stores = an.by_store(receipts)
        st.altair_chart(
            alt.Chart(stores)
            .mark_bar(cornerRadiusTopRight=6, cornerRadiusBottomRight=6, color=CHART_COLOR)
            .encode(
                y=alt.Y("store:N", sort="-x", title=None),
                x=alt.X("total:Q", title="€"),
                tooltip=[
                    alt.Tooltip("store:N", title="Store"),
                    alt.Tooltip("total:Q", title="Spent €", format=".2f"),
                    alt.Tooltip("visits:Q", title="Visits"),
                ],
            )
            .properties(height=280),
            width="stretch",
        )

    left, right = st.columns([3, 2], gap="large")
    with left:
        st.subheader("Top products")
        st.dataframe(
            an.top_products(items),
            hide_index=True,
            width="stretch",
            column_config={
                "product": "Product",
                "times_bought": st.column_config.NumberColumn("Bought", format="%d×"),
                "spent": st.column_config.ProgressColumn(
                    "Spent", format="%.2f €", min_value=0, max_value=float(max(an.top_products(items)["spent"].max(), 1))
                ),
            },
        )
    with right:
        st.subheader("Pfand & discounts")
        x = an.extras(items)
        e1, e2 = st.columns(2)
        e1.metric("Saved by discounts", support.euro(x["discounts_saved"]))
        e2.metric("Open Pfand", support.euro(x["deposit_open"]), help="Deposit paid on bottles you have not returned yet.")
        st.caption(f"Pfand paid {support.euro(x['deposit_paid'])} · returned {support.euro(x['deposit_returned'])}")


# --- Navigation ------------------------------------------------------------------------------------------


def sidebar() -> None:
    with st.sidebar:
        st.markdown("## 🧾 Kassenbon")
        st.caption("Receipt scanner & spending tracker")
        st.text_input("Gemini model", value=os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL, key="model")
        st.text_input(
            "Fallback model (optional)",
            value=os.environ.get("GEMINI_FALLBACK_MODEL", ""),
            key="fallback_model",
            placeholder="e.g. gemini-3.5-flash-lite",
            help="Tried automatically if the main model stays busy (503) or rate-limited (429) after 3 retries. "
            "Comma-separate several models.",
        )
        api_key_section()
        st.caption(f"Data in `{get_store().path.name}`", help=str(get_store().path.resolve()))


def api_key_section() -> None:
    has_env_key = bool(env_api_key())
    st.text_input(
        "Gemini API key",
        type="password",
        key="api_key_input",
        placeholder="Paste to override .env" if has_env_key else "Paste your key",
        help="A key entered here is used for this browser session only and is not saved, "
        "unless you click 'Save to .env'. Get one at https://aistudio.google.com/apikey.",
    )
    _, source = current_api_key()
    if source == "entered":
        st.caption("🟢 Using the key entered above")
        if st.button("Save to .env", icon="💾", help=f"Writes GEMINI_API_KEY to {ENV_FILE} (git-ignored)."):
            entered = st.session_state["api_key_input"].strip()
            set_key(str(ENV_FILE), "GEMINI_API_KEY", entered, quote_mode="never")
            os.environ["GEMINI_API_KEY"] = entered
            st.toast("Key saved to receipts/.env. It loads automatically next time.", icon="💾")
    elif source == "env":
        st.caption("🟢 Using the key from .env / environment")
    else:
        st.caption("🔴 No API key: paste one above or add it to `receipts/.env`")


def main() -> None:
    sidebar()
    page = st.navigation(
        [
            st.Page(scan_page, title="Scan", icon="📷", default=True),
            st.Page(receipts_page, title="Receipts", icon="🧾", url_path="receipts"),
            st.Page(dashboard_page, title="Spending", icon="📊", url_path="spending"),
        ]
    )
    page.run()


if __name__ == "__main__":  # streamlit run executes the script as __main__; tests import the page functions
    main()
