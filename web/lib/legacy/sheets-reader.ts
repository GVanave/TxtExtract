import { JWT } from "google-auth-library";

import { ITEMS_TAB, RECEIPTS_TAB, rowsToReceipts, type SavedReceipt } from "./sheet-rows";

/** Reads receipts from the old Google Sheet (read-only), for the one-time import into the database. */

const API = "https://sheets.googleapis.com/v4/spreadsheets";

export class SheetsReader {
  private readonly client: JWT;

  constructor(
    private readonly spreadsheetId: string,
    serviceAccountEmail: string,
    privateKey: string,
  ) {
    this.client = new JWT({
      email: serviceAccountEmail,
      // .env files store the key on one line with literal "\n".
      key: privateKey.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
  }

  async list(): Promise<SavedReceipt[]> {
    const ranges = [`${RECEIPTS_TAB}!A2:N`, `${ITEMS_TAB}!A2:L`].map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
    type Batch = { valueRanges: { values?: unknown[][] }[] };
    let batch: Batch;
    try {
      const response = await this.client.request<Batch>({
        url: `${API}/${this.spreadsheetId}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE`,
      });
      batch = response.data;
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      throw new Error(
        status === 403 || status === 404
          ? `Google Sheets refused access (${status}). Is the sheet shared with ${this.client.email}, and is GOOGLE_SHEET_ID right?`
          : `Reading the Google Sheet failed: ${(error as Error).message}`,
      );
    }
    return rowsToReceipts(batch.valueRanges[0]?.values ?? [], batch.valueRanges[1]?.values ?? []);
  }
}
