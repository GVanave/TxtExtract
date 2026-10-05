from receipt_extractor import LineItem, LineType, Receipt, VatEntry, validate_receipt


def item(text, total, line_type=LineType.PRODUCT, quantity=None, unit=None, unit_price=None, vat_code="B"):
    return LineItem(
        raw_text=text,
        name=text.title(),
        line_type=line_type,
        quantity=quantity,
        unit=unit,
        unit_price=unit_price,
        total_price=total,
        vat_code=vat_code,
    )


def receipt(items, total, vat_summary=(), date="2026-09-28"):
    return Receipt(
        store_name="LIDL",
        store_address=None,
        date=date,
        time="18:42",
        currency="EUR",
        line_items=list(items),
        total=total,
        payment_method="girocard",
        vat_summary=list(vat_summary),
    )


def lidl_receipt(**overrides):
    items = [
        item("BIO VOLLM. 3,8%", 1.19),
        item("BANANEN", 1.44, quantity=0.482, unit="kg", unit_price=2.99),
        item("JOGHURT", 1.58, quantity=2, unit="pcs", unit_price=0.79),
        item("MINERALW.", 0.39, vat_code="A"),
        item("PFAND 0,25", 0.25, line_type=LineType.DEPOSIT, vat_code="A"),
        item("RABATT JOGHURT", -0.30, line_type=LineType.DISCOUNT),
        item("LEERGUT", -0.75, line_type=LineType.DEPOSIT_RETURN, vat_code="A"),
    ]
    data = {"items": items, "total": 3.80}
    data.update(overrides)
    return receipt(data.pop("items"), **data)


def test_consistent_receipt_passes():
    result = validate_receipt(lidl_receipt())
    assert result.ok, result.issues


def test_float_sums_do_not_cause_false_alarms():
    items = [item(f"ARTIKEL {i}", 0.1) for i in range(30)]
    assert validate_receipt(receipt(items, total=3.0)).ok


def test_total_mismatch_is_flagged():
    result = validate_receipt(lidl_receipt(total=4.80))
    assert not result.ok
    assert "add up to 3.80" in result.issues[0]
    assert "4.80" in result.issues[0]


def test_quantity_times_unit_price_mismatch_is_flagged():
    items = [item("JOGHURT", 1.58, quantity=3, unit="pcs", unit_price=0.79)]
    result = validate_receipt(receipt(items, total=1.58))
    assert len(result.issues) == 1
    assert "JOGHURT" in result.issues[0]


def test_weighed_item_rounding_is_tolerated():
    items = [item("TOMATEN", 2.07, quantity=0.693, unit="kg", unit_price=2.99)]
    assert validate_receipt(receipt(items, total=2.07)).ok


def test_vat_table_matching_total_passes():
    vat = [
        VatEntry(code="A", rate_percent=19, net=0.33, vat=0.06, gross=0.39),
        VatEntry(code="B", rate_percent=7, net=1.11, vat=0.08, gross=1.19),
    ]
    items = [item("BIO VOLLM. 3,8%", 1.19), item("MINERALW.", 0.39, vat_code="A")]
    assert validate_receipt(receipt(items, total=1.58, vat_summary=vat)).ok


def test_vat_table_mismatch_is_flagged():
    vat = [VatEntry(code="B", rate_percent=7, net=None, vat=None, gross=9.99)]
    items = [item("BIO VOLLM. 3,8%", 1.19)]
    result = validate_receipt(receipt(items, total=1.19, vat_summary=vat))
    assert any("VAT table" in issue for issue in result.issues)


def test_invalid_date_is_flagged():
    result = validate_receipt(lidl_receipt(date="28.09.2026"))
    assert any("Date" in issue for issue in result.issues)


def test_missing_date_is_allowed():
    assert validate_receipt(lidl_receipt(date=None)).ok


def test_empty_receipt_is_flagged():
    result = validate_receipt(receipt([], total=0))
    assert result.issues == ["No line items were extracted."]
