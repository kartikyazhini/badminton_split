import express from "express";
import path from "path";
import fs from "fs";
import { google } from "googleapis";

const app = express();
app.use(express.json({ limit: "10mb" }));

// Lightweight CORS middleware to support GitHub Pages hosting
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

const PORT = 3000;

const staticPath = path.join(process.cwd(), "static");
const firebaseConfigFile = path.join(process.cwd(), "firebase-applet-config.json");

// API Endpoint to serve Firebase config
app.get("/api/config/firebase", (req, res) => {
  if (fs.existsSync(firebaseConfigFile)) {
    const config = JSON.parse(fs.readFileSync(firebaseConfigFile, "utf-8"));
    res.json(config);
  } else {
    res.status(404).json({ error: "Firebase config not found" });
  }
});

// API Endpoint to sync Quarters and Expenses to Google Sheets
app.post("/api/sheets/sync", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header. Please sign in with Google." });
    }
    const accessToken = authHeader.split(" ")[1];

    const { quarters = [], players = [], sessions = [], spreadsheetId, fileName, sheetName, syncQuarterId } = req.body;

    // Build Google OAuth2 client with user's access token
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: "v4", auth });

    let resolvedSpreadsheetId = spreadsheetId;

    // Resolve spreadsheetId by fileName if provided
    if (fileName && fileName.trim()) {
      try {
        const drive = google.drive({ version: "v3", auth });
        const fileList = await drive.files.list({
          q: `name = '${fileName.trim().replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
          fields: "files(id, name)",
          spaces: "drive",
        });
        const files = fileList.data.files || [];
        if (files.length > 0) {
          resolvedSpreadsheetId = files[0].id!;
          console.log(`Found existing spreadsheet matching file name "${fileName}": ${resolvedSpreadsheetId}`);
        } else {
          // Create a new spreadsheet with the specified file name
          const createRes = await sheets.spreadsheets.create({
            requestBody: {
              properties: {
                title: fileName.trim(),
              },
            },
          });
          resolvedSpreadsheetId = createRes.data.spreadsheetId!;
          console.log(`Created new spreadsheet with file name "${fileName}": ${resolvedSpreadsheetId}`);
        }
      } catch (err: any) {
        console.error("Error finding/creating spreadsheet by file name:", err);
        return res.status(500).json({ error: `Could not search or create spreadsheet named "${fileName}": ${err.message}` });
      }
    }

    if (!resolvedSpreadsheetId) {
      return res.status(400).json({ error: "Spreadsheet ID or File Name is required." });
    }

    // 1. Fetch spreadsheet details to check existing sheet tabs
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: resolvedSpreadsheetId });
    const existingSheets = spreadsheet.data.sheets || [];
    const existingTitles = existingSheets.map((s) => s.properties?.title).filter(Boolean) as string[];

    // Map of players by ID
    const playerMap = new Map<number, string>();
    players.forEach((p: any) => {
      if (p && p.id != null) {
        playerMap.set(p.id, p.name || `Player #${p.id}`);
      }
    });

    // Resolve synchronization target quarter if provided
    const targetQuarter = syncQuarterId ? quarters.find((q: any) => q.id === Number(syncQuarterId)) : null;
    const filteredSessions = targetQuarter ? sessions.filter((s: any) => s.quarterId === targetQuarter.id) : sessions;

    // Define synchronization targets (mode depends on sheetName presence)
    const syncTargets = targetQuarter ? [
      {
        title: (sheetName && sheetName.trim()) ? sheetName.trim() : (targetQuarter.name || `Quarter ${targetQuarter.id}`),
        sessions: filteredSessions,
      }
    ] : (sheetName && sheetName.trim()) ? [
      {
        title: sheetName.trim(),
        sessions: filteredSessions,
      }
    ] : quarters.map((q: any) => ({
      title: q.name || `Quarter ${q.id}`,
      sessions: filteredSessions.filter((s: any) => s.quarterId === q.id),
    }));

    const requests: any[] = [];

    // Check if new sheet tab needs to be created for any target
    for (const target of syncTargets) {
      if (!existingTitles.includes(target.title)) {
        requests.push({
          addSheet: {
            properties: {
              title: target.title,
              gridProperties: {
                frozenRowCount: 1,
              },
            },
          },
        });
        existingTitles.push(target.title);
      }
    }

    // Delete sheets that are not in the syncTargets list (only if it's a full sync)
    if (!targetQuarter && !(sheetName && sheetName.trim())) {
      const targetTitles = syncTargets.map((t) => t.title.toLowerCase());
      for (const sheet of existingSheets) {
        const title = sheet.properties?.title;
        const sheetId = sheet.properties?.sheetId;
        if (!title || sheetId == null) continue;

        const tLower = title.toLowerCase();
        // Skip protected/system tabs
        if (
          tLower.includes("template") ||
          tLower.includes("readme") ||
          tLower.includes("sheet1") ||
          tLower.includes("summary") ||
          tLower === "database"
        ) {
          continue;
        }

        // If the tab is not in our target quarters list, delete it from Google Sheets
        if (!targetTitles.includes(tLower)) {
          console.log(`Deleting obsolete sheet tab "${title}" (ID: ${sheetId}) from spreadsheet: ${resolvedSpreadsheetId}`);
          requests.push({
            deleteSheet: {
              sheetId: sheetId,
            },
          });
        }
      }
    }

    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: resolvedSpreadsheetId,
        requestBody: { requests },
      });
    }

    // Try reading reference sheet header structure if accessible by resolving tab name for gid 382666597
    let refHeaderRow: string[] | null = null;
    try {
      const refMeta = await sheets.spreadsheets.get({
        spreadsheetId: "1ATIG4ral9eez71KpWrfTnJd5Ja67AR_H2xyMOhQkG-E",
      });
      const refSheets = refMeta.data.sheets || [];
      const targetSheet = refSheets.find((s) => s.properties?.sheetId === 382666597) || refSheets[0];
      if (targetSheet) {
        const refTitle = targetSheet.properties?.title;
        const refRes = await sheets.spreadsheets.values.get({
          spreadsheetId: "1ATIG4ral9eez71KpWrfTnJd5Ja67AR_H2xyMOhQkG-E",
          range: `'${refTitle}'!A1:Z50`,
        });
        if (refRes.data.values && refRes.data.values[0]) {
          refHeaderRow = refRes.data.values[0];
          console.log("Successfully fetched exact referenced sheet headers:", refHeaderRow);
          fs.writeFileSync("./ref_sheet_structure.json", JSON.stringify(refRes.data.values, null, 2));
          console.log("Saved full ref sheet structure to ref_sheet_structure.json");
        }
      }
    } catch (err: any) {
      console.log("Reference sheet not directly readable or requires permission, using standard player matrix headers:", err.message);
    }

    // Sort players deterministically by ID or Name
    const sortedPlayers = [...players].sort((a: any, b: any) => (a.id || 0) - (b.id || 0));

    // Group players into family columns
    const sheetColumns: { name: string; playerIds: number[]; type: 'individual' | 'family' }[] = [];
    const processedPlayerIds = new Set<number>();

    const familyMap = new Map<string, any[]>();
    players.forEach((p: any) => {
      const fam = (p.family || "").trim();
      if (fam) {
        const key = fam.toLowerCase();
        if (!familyMap.has(key)) {
          familyMap.set(key, []);
        }
        familyMap.get(key)!.push(p);
      }
    });

    sortedPlayers.forEach((p: any) => {
      if (processedPlayerIds.has(p.id)) return;

      const fam = (p.family || "").trim();
      if (fam) {
        const key = fam.toLowerCase();
        const familyPlayers = familyMap.get(key) || [];
        const sortedFamPlayers = [...familyPlayers].sort((a: any, b: any) => (a.id || 0) - (b.id || 0));
        const colName = sortedFamPlayers.map((fp) => fp.name).join("/");
        
        sheetColumns.push({
          type: 'family',
          name: colName,
          playerIds: sortedFamPlayers.map((fp) => fp.id),
        });

        sortedFamPlayers.forEach((fp) => processedPlayerIds.add(fp.id));
      } else {
        sheetColumns.push({
          type: 'individual',
          name: p.name,
          playerIds: [p.id],
        });
        processedPlayerIds.add(p.id);
      }
    });

    // Dynamic field mapping function based on column name
    const getRowValue = (
      headerName: string,
      s: any,
      playerMap: Map<number, string>,
      sheetColumns: any[],
      totalQuarterExpense: number,
      columnTotals: { [key: string]: number },
      isSummaryRow: boolean
    ) => {
      const hLower = String(headerName || "").trim().toLowerCase();
      if (!hLower) return "";

      if (isSummaryRow) {
        if (hLower.includes("date") || hLower.includes("dt") || hLower.includes("day")) {
          return "TOTAL";
        }
        if (hLower.includes("type") || hLower.includes("description") || hLower.includes("item")) {
          return "";
        }
        if (
          hLower.includes("total") ||
          hLower.includes("fee") ||
          hLower.includes("amount") ||
          hLower.includes("cost") ||
          hLower.includes("price")
        ) {
          return Number(totalQuarterExpense.toFixed(2));
        }
        // Check if it matches a column's name
        const matchingCol = sheetColumns.find(
          (c) => c.name && c.name.toLowerCase() === hLower
        );
        if (matchingCol) {
          return Number((columnTotals[matchingCol.name] || 0).toFixed(2));
        }
        return "";
      }

      // Standard session row mapping
      if (hLower.includes("date") || hLower.includes("dt") || hLower.includes("day")) {
        if (!s.date) return "";
        try {
          return new Date(s.date).toISOString().split("T")[0];
        } catch (e) {
          return String(s.date);
        }
      }

      if (hLower.includes("type") || hLower.includes("description") || hLower.includes("item")) {
        return s.expenseType || "Court Rental";
      }

      if (
        hLower.includes("total") ||
        hLower.includes("fee") ||
        hLower.includes("amount") ||
        hLower.includes("price")
      ) {
        return Number(s.courtFee) || 0;
      }

      if (hLower.includes("paid") || hLower.includes("payer") || hLower.includes("buyer")) {
        if (s.paidById != null && s.paidById !== "") {
          const payerId = Number(s.paidById);
          return playerMap.get(payerId) || `Player #${payerId}`;
        }
        return "Unassigned";
      }

      if (
        hLower.includes("attendees count") ||
        hLower.includes("count") ||
        hLower.includes("no. of players") ||
        hLower.includes("pax") ||
        hLower.includes("number of players") ||
        hLower.includes("attendees")
      ) {
        const attendeeIds = Array.isArray(s.attendeeIds) ? s.attendeeIds : [];
        return attendeeIds.length > 0 ? attendeeIds.length : 1;
      }

      if (
        hLower.includes("cost") ||
        hLower.includes("person") ||
        hLower.includes("each") ||
        hLower.includes("split") ||
        hLower.includes("share") ||
        hLower.includes("individual")
      ) {
        const fee = Number(s.courtFee) || 0;
        const attendeeIds = Array.isArray(s.attendeeIds) ? s.attendeeIds : [];
        const count = attendeeIds.length > 0 ? attendeeIds.length : 1;
        return Number((fee / count).toFixed(2));
      }

      if (hLower.includes("comment") || hLower.includes("note") || hLower.includes("notes") || hLower.includes("remark") || hLower.includes("remarks")) {
        return s.comment || "";
      }

      // Check if matches a player/family column exactly or case-insensitively
      const matchingCol = sheetColumns.find(
        (c) => c.name && c.name.toLowerCase() === hLower
      );
      if (matchingCol) {
        const attendeeIds = Array.isArray(s.attendeeIds) ? s.attendeeIds : [];
        const fee = Number(s.courtFee) || 0;
        const count = attendeeIds.length > 0 ? attendeeIds.length : 1;
        const costPerPerson = Number((fee / count).toFixed(2));

        const attendingCount = matchingCol.playerIds.filter((pId: number) => attendeeIds.includes(pId)).length;
        if (attendingCount > 0) {
          return Number((attendingCount * costPerPerson).toFixed(2));
        }
        return 0;
      }

      return "";
    };

    // 2. Format and write expense data for each target into its own sheet tab
    const freshSpreadsheet = await sheets.spreadsheets.get({ spreadsheetId: resolvedSpreadsheetId });
    const freshSheets = freshSpreadsheet.data.sheets || [];

    for (const target of syncTargets) {
      const title = target.title;
      const qSessions = target.sessions;

      // Filter players active in this target's sessions
      const activePlayerIdsForTarget = new Set<number>();
      qSessions.forEach((s: any) => {
        const attendeeIds = Array.isArray(s.attendeeIds) ? s.attendeeIds : [];
        attendeeIds.forEach((id: any) => {
          if (id != null) activePlayerIdsForTarget.add(Number(id));
        });
        if (s.paidById != null && s.paidById !== "") {
          activePlayerIdsForTarget.add(Number(s.paidById));
        }
      });

      const targetPlayers = players.filter((p: any) => p && p.id != null && activePlayerIdsForTarget.has(Number(p.id)));
      const sortedTargetPlayers = [...targetPlayers].sort((a: any, b: any) => (a.id || 0) - (b.id || 0));

      const sheetColumns: { name: string; playerIds: number[]; type: 'individual' | 'family' }[] = [];
      const processedPlayerIds = new Set<number>();

      const targetFamilyMap = new Map<string, any[]>();
      targetPlayers.forEach((p: any) => {
        const fam = (p.family || "").trim();
        if (fam) {
          const key = fam.toLowerCase();
          if (!targetFamilyMap.has(key)) {
            targetFamilyMap.set(key, []);
          }
          targetFamilyMap.get(key)!.push(p);
        }
      });

      sortedTargetPlayers.forEach((p: any) => {
        if (processedPlayerIds.has(p.id)) return;

        const fam = (p.family || "").trim();
        if (fam) {
          const key = fam.toLowerCase();
          const familyPlayers = targetFamilyMap.get(key) || [];
          const sortedFamPlayers = [...familyPlayers].sort((a: any, b: any) => (a.id || 0) - (b.id || 0));
          const colName = sortedFamPlayers.map((fp) => fp.name).join("/");
          
          sheetColumns.push({
            type: 'family',
            name: colName,
            playerIds: sortedFamPlayers.map((fp) => fp.id),
          });

          sortedFamPlayers.forEach((fp) => processedPlayerIds.add(fp.id));
        } else {
          sheetColumns.push({
            type: 'individual',
            name: p.name,
            playerIds: [p.id],
          });
          processedPlayerIds.add(p.id);
        }
      });

      // Setup default headers with family grouped columns
      const defaultHeaders = [
        "Date",
        "Expense Type / Description",
        "Total Fee ($)",
        "Paid By",
        "Attendees Count",
        "Cost / Person ($)",
        ...sheetColumns.map((col) => col.name),
        "Comments / Notes",
      ];

      const finalHeader = defaultHeaders;

      const rows: any[][] = [finalHeader];
      let totalQuarterExpense = 0;
      
      const columnTotals: { [key: string]: number } = {};
      sheetColumns.forEach((col) => {
        columnTotals[col.name] = 0;
      });

      // Calculate column total balances for this quarter
      for (const s of qSessions) {
        const fee = Number(s.courtFee) || 0;
        totalQuarterExpense += fee;

        const attendeeIds = Array.isArray(s.attendeeIds) ? s.attendeeIds : [];
        const count = attendeeIds.length > 0 ? attendeeIds.length : 1;
        const costPerPerson = Number((fee / count).toFixed(2));

        sheetColumns.forEach((col) => {
          const attendingCount = col.playerIds.filter((pId) => attendeeIds.includes(pId)).length;
          if (attendingCount > 0) {
            columnTotals[col.name] = (columnTotals[col.name] || 0) + (attendingCount * costPerPerson);
          }
        });
      }

      // Map sessions to row rows
      // We allocate exactly 41 rows (index 1 to 41) for expenses (representing Rows 2 to 42)
      const maxCols = Math.max(finalHeader.length, 7 + sheetColumns.length);
      for (let i = 0; i < 41; i++) {
        if (i < qSessions.length) {
          const s = qSessions[i];
          const row = Array.from({ length: maxCols }).map((_, idx) => {
            if (idx < finalHeader.length) {
              return getRowValue(finalHeader[idx], s, playerMap, sheetColumns, totalQuarterExpense, columnTotals, false);
            }
            return "";
          });
          rows.push(row);
        } else {
          // Empty padding row
          rows.push(Array.from({ length: maxCols }).map(() => ""));
        }
      }

      // Leave 3 rows blank: Row 43, 44, 45 (indices 42, 43, 44)
      rows.push(Array.from({ length: maxCols }).map(() => ""));
      rows.push(Array.from({ length: maxCols }).map(() => ""));
      rows.push(Array.from({ length: maxCols }).map(() => ""));

      // Find column indices dynamically
      const columnIndices: { [colName: string]: number } = {};
      finalHeader.forEach((hName, idx) => {
        const hLower = String(hName || "").trim().toLowerCase();
        const col = sheetColumns.find(c => c.name.toLowerCase() === hLower);
        if (col) {
          columnIndices[col.name] = idx;
        }
      });

      // Build Row 46 (index 45): "Total Paid"
      const totalPaidRow = Array.from({ length: maxCols }).map((_, idx) => {
        if (idx === 4) return "Total Paid"; // Column E is index 4 (0-based)
        if (idx === 2) return "=SUM(C2:C42)"; // Column C total fee sum formula

        if (idx >= 6 && idx < 6 + sheetColumns.length) {
          const col = sheetColumns[idx - 6];
          if (col) {
            const colPlayers = col.playerIds.map(pId => {
              const p = players.find((pl: any) => pl.id === pId);
              return p ? p.name : "";
            }).filter(Boolean);

            if (colPlayers.length > 0) {
              const sumifs = colPlayers.map(pName => `SUMIF($D$2:$D$42, "${pName}", $C$2:$C$42)`).join(" + ");
              return `=${sumifs}`;
            }
          }
        }
        return "";
      });

      // Build Row 47 (index 46): "Total Cost"
      const totalCostRow = Array.from({ length: maxCols }).map((_, idx) => {
        if (idx === 4) return "Total Cost"; // Column E is index 4 (0-based)
        if (idx === 2) return "=SUM(C2:C42)"; // Column C total fee sum formula

        if (idx >= 6 && idx < 6 + sheetColumns.length) {
          const colLetter = getColumnLetter(idx);
          return `=SUM(${colLetter}2:${colLetter}42)`;
        }
        return "";
      });

      // Build Row 48 (index 47): "To Pay/(Receive)"
      const toPayReceiveRow = Array.from({ length: maxCols }).map((_, idx) => {
        if (idx === 4) return "To Pay/(Receive)"; // Column E is index 4 (0-based)
        if (idx === 2) return "=C47-C46"; // Column C total balance (will be 0.00)

        if (idx >= 6 && idx < 6 + sheetColumns.length) {
          const colLetter = getColumnLetter(idx);
          return `=${colLetter}47-${colLetter}46`;
        }
        return "";
      });

      rows.push(totalPaidRow, totalCostRow, toPayReceiveRow);

      // Clear previous values in tab and write updated data
      await sheets.spreadsheets.values.clear({
        spreadsheetId: resolvedSpreadsheetId,
        range: `'${title}'!A1:ZZ5000`,
        requestBody: {},
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: resolvedSpreadsheetId,
        range: `'${title}'!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: rows,
        },
      });

      // Apply nice formatting to the target sheet
      const currentSheetObj = freshSheets.find((s) => s.properties?.title === title);
      const sheetId = currentSheetObj?.properties?.sheetId;

      if (sheetId !== undefined && sheetId !== null) {
        const formattingRequests: any[] = [];

        // 1. Format headers (Row 1, index 0)
        formattingRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: maxCols
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 30/255, green: 41/255, blue: 59/255 }, // Slate `#1e293b`
                textFormat: {
                  bold: true,
                  foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
                  fontSize: 10,
                  fontFamily: "Arial"
                },
                horizontalAlignment: "CENTER",
                verticalAlignment: "MIDDLE",
                wrapStrategy: "WRAP"
              }
            },
            fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)"
          }
        });

        // 2. Format general data cells (Row 2 to 42, index 1 to 41) for vertical alignment & font
        formattingRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 42,
              startColumnIndex: 0,
              endColumnIndex: maxCols
            },
            cell: {
              userEnteredFormat: {
                textFormat: {
                  fontSize: 9,
                  fontFamily: "Arial"
                },
                verticalAlignment: "MIDDLE"
              }
            },
            fields: "userEnteredFormat(textFormat,verticalAlignment)"
          }
        });

        // 3. Format column specific alignments and number formats
        // Column 0: Date (Centered)
        formattingRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 42,
              startColumnIndex: 0,
              endColumnIndex: 1
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "CENTER"
              }
            },
            fields: "userEnteredFormat(horizontalAlignment)"
          }
        });

        // Column 1: Description (Left)
        formattingRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 42,
              startColumnIndex: 1,
              endColumnIndex: 2
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "LEFT"
              }
            },
            fields: "userEnteredFormat(horizontalAlignment)"
          }
        });

        // Column 2: Total Fee (Right, Currency)
        formattingRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 42,
              startColumnIndex: 2,
              endColumnIndex: 3
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "RIGHT",
                numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" }
              }
            },
            fields: "userEnteredFormat(horizontalAlignment,numberFormat)"
          }
        });

        // Column 3: Paid By (Centered)
        formattingRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 42,
              startColumnIndex: 3,
              endColumnIndex: 4
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "CENTER"
              }
            },
            fields: "userEnteredFormat(horizontalAlignment)"
          }
        });

        // Column 4: Attendees Count (Centered, Number)
        formattingRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 42,
              startColumnIndex: 4,
              endColumnIndex: 5
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "CENTER",
                numberFormat: { type: "NUMBER", pattern: "#,##0" }
              }
            },
            fields: "userEnteredFormat(horizontalAlignment,numberFormat)"
          }
        });

        // Column 5: Cost / Person (Right, Currency)
        formattingRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 42,
              startColumnIndex: 5,
              endColumnIndex: 6
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "RIGHT",
                numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" }
              }
            },
            fields: "userEnteredFormat(horizontalAlignment,numberFormat)"
          }
        });

        // Columns G onwards to player columns (Right, Currency)
        if (maxCols > 6) {
          formattingRequests.push({
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 1,
                endRowIndex: 42,
                startColumnIndex: 6,
                endColumnIndex: maxCols - 1
              },
              cell: {
                userEnteredFormat: {
                  horizontalAlignment: "RIGHT",
                  numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" }
                }
              },
              fields: "userEnteredFormat(horizontalAlignment,numberFormat)"
            }
          });
        }

        // Column maxCols - 1 (Comments/Notes: Left)
        formattingRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 42,
              startColumnIndex: maxCols - 1,
              endColumnIndex: maxCols
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "LEFT"
              }
            },
            fields: "userEnteredFormat(horizontalAlignment)"
          }
        });

        // 4. Backgrounds for actual vs empty slots
        // Actual sessions: white background
        if (qSessions.length > 0) {
          formattingRequests.push({
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 1,
                endRowIndex: 1 + qSessions.length,
                startColumnIndex: 0,
                endColumnIndex: maxCols
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 1.0, green: 1.0, blue: 1.0 }
                }
              },
              fields: "userEnteredFormat(backgroundColor)"
            }
          });
        }
        // Empty slots: subtle gray `#fcfcfc`
        if (42 > 1 + qSessions.length) {
          formattingRequests.push({
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 1 + qSessions.length,
                endRowIndex: 42,
                startColumnIndex: 0,
                endColumnIndex: maxCols
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.98, green: 0.98, blue: 0.98 }
                }
              },
              fields: "userEnteredFormat(backgroundColor)"
            }
          });
        }

        // 5. Grid borders for data range (Row 1 to 42, index 0 to 42)
        formattingRequests.push({
          updateBorders: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 42,
              startColumnIndex: 0,
              endColumnIndex: maxCols
            },
            innerHorizontal: {
              style: "SOLID",
              color: { red: 0.88, green: 0.91, blue: 0.94 } // light slate border
            },
            innerVertical: {
              style: "SOLID",
              color: { red: 0.88, green: 0.91, blue: 0.94 }
            },
            top: {
              style: "SOLID",
              color: { red: 0.7, green: 0.7, blue: 0.7 }
            },
            bottom: {
              style: "SOLID",
              color: { red: 0.7, green: 0.7, blue: 0.7 }
            },
            left: {
              style: "SOLID",
              color: { red: 0.7, green: 0.7, blue: 0.7 }
            },
            right: {
              style: "SOLID",
              color: { red: 0.7, green: 0.7, blue: 0.7 }
            }
          }
        });

        // 6. Format Total Rows: Row 46 (index 45) and Row 47 (index 46) -> Total Paid and Total Cost
        formattingRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 45,
              endRowIndex: 47,
              startColumnIndex: 0,
              endColumnIndex: maxCols
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 241/255, green: 245/255, blue: 249/255 }, // Slate `#f1f5f9`
                textFormat: {
                  bold: true,
                  foregroundColor: { red: 0.09, green: 0.09, blue: 0.11 }, // Dark slate
                  fontSize: 10,
                  fontFamily: "Arial"
                },
                verticalAlignment: "MIDDLE"
              }
            },
            fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)"
          }
        });

        // Format individual cell alignments / values for Total Rows 46 & 47
        // Label cell: Column E (index 4) should be RIGHT aligned and bold
        formattingRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 45,
              endRowIndex: 47,
              startColumnIndex: 4,
              endColumnIndex: 5
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "RIGHT"
              }
            },
            fields: "userEnteredFormat(horizontalAlignment)"
          }
        });

        // Value cells: Column F (index 5) and G onwards should be RIGHT aligned and formatted as CURRENCY
        formattingRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 45,
              endRowIndex: 47,
              startColumnIndex: 5,
              endColumnIndex: maxCols
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "RIGHT",
                numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" }
              }
            },
            fields: "userEnteredFormat(horizontalAlignment,numberFormat)"
          }
        });

        // 7. Format final Net Balance Row: Row 48 (index 47) -> To Pay/(Receive)
        formattingRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 47,
              endRowIndex: 48,
              startColumnIndex: 0,
              endColumnIndex: maxCols
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 236/255, green: 253/255, blue: 245/255 }, // Emerald `#ecfdf5`
                textFormat: {
                  bold: true,
                  foregroundColor: { red: 6/255, green: 95/255, blue: 70/255 }, // Dark emerald
                  fontSize: 10,
                  fontFamily: "Arial"
                },
                verticalAlignment: "MIDDLE"
              }
            },
            fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)"
          }
        });

        // Label cell for Row 48: Column E (index 4)
        formattingRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 47,
              endRowIndex: 48,
              startColumnIndex: 4,
              endColumnIndex: 5
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "RIGHT"
              }
            },
            fields: "userEnteredFormat(horizontalAlignment)"
          }
        });

        // Value cells for Row 48: Column F (index 5) and G onwards
        formattingRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 47,
              endRowIndex: 48,
              startColumnIndex: 5,
              endColumnIndex: maxCols
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "RIGHT",
                numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" }
              }
            },
            fields: "userEnteredFormat(horizontalAlignment,numberFormat)"
          }
        });

        // 8. Borders for Total section
        // Top border on Row 46 (index 45): thin separator
        formattingRequests.push({
          updateBorders: {
            range: {
              sheetId,
              startRowIndex: 45,
              endRowIndex: 46,
              startColumnIndex: 0,
              endColumnIndex: maxCols
            },
            top: {
              style: "SOLID_MEDIUM",
              color: { red: 0.5, green: 0.5, blue: 0.5 }
            }
          }
        });

        // Double bottom border on Row 48 (index 47): classic accounting double underline!
        formattingRequests.push({
          updateBorders: {
            range: {
              sheetId,
              startRowIndex: 47,
              endRowIndex: 48,
              startColumnIndex: 0,
              endColumnIndex: maxCols
            },
            bottom: {
              style: "DOUBLE",
              color: { red: 0.02, green: 0.37, blue: 0.27 } // Emerald double underline
            }
          }
        });

        // 9. Auto-resize all columns to look perfect
        formattingRequests.push({
          autoResizeDimensions: {
            dimensions: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 0,
              endIndex: maxCols
            }
          }
        });

        // Execute batchUpdate formatting requests
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: resolvedSpreadsheetId,
          requestBody: {
            requests: formattingRequests
          }
        });
      }
    }

    res.json({
      success: true,
      syncedQuartersCount: syncTargets.length,
      syncedSessionsCount: sessions.length,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${resolvedSpreadsheetId}`,
    });
  } catch (error: any) {
    console.error("Error syncing to Google Sheets:", error);
    const errMessage = String(error && error.message || "");
    const isAuthError =
      error.status === 401 ||
      (error.response && error.response.status === 401) ||
      errMessage.includes("invalid authentication credentials") ||
      errMessage.includes("Expected OAuth 2 access token") ||
      errMessage.includes("invalid_grant") ||
      errMessage.toLowerCase().includes("auth") ||
      errMessage.toLowerCase().includes("credential") ||
      errMessage.toLowerCase().includes("token");

    if (isAuthError) {
      res.status(401).json({ error: "Your Google session is invalid or has expired. Please sign in again." });
    } else {
      res.status(500).json({ error: error.message || "Failed to sync data to Google Sheets" });
    }
  }
});

// Global Helper: Get Google Sheets column letter for 0-based column index
const getColumnLetter = (colIdx: number): string => {
  let temp = colIdx;
  let letter = "";
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
};

// Global Helper: Match player names or custom nicknames
const isPlayerMatch = (playerName: string, searchStr: string): boolean => {
  const pLower = String(playerName || "").toLowerCase().trim();
  const sLower = String(searchStr || "").toLowerCase().trim();
  
  if (pLower === sLower) return true;
  
  // Custom nickname mappings
  if (pLower === "abhaya" && sLower === "abs") return true;
  if (pLower === "abs" && sLower === "abhaya") return true;
  if (pLower === "krams" && (sLower === "kramamoo" || sLower === "kramamooo" || sLower === "kram")) return true;
  if (pLower === "kramamoo" && sLower === "krams") return true;
  if (pLower === "om" && sLower === "omi") return true;
  if (pLower === "omi" && sLower === "om") return true;
  
  return false;
};

// Global Helper: Check if searchStr contains a player's name or nickname
const searchStrContainsPlayer = (searchStr: string, playerName: string): boolean => {
  const sLower = String(searchStr || "").toLowerCase().trim();
  const pLower = String(playerName || "").toLowerCase().trim();

  // Tokenize the searchStr to avoid matching substrings like "om" inside "komal"
  const words = sLower.split(/[^a-zA-Z0-9]+/).map(w => w.trim()).filter(Boolean);
  
  const namesToCheck = [pLower];
  if (pLower === "abhaya" || pLower === "abs") namesToCheck.push("abhaya", "abs");
  if (pLower === "krams" || pLower === "kramamoo" || pLower === "kramamooo" || pLower === "kram") {
    namesToCheck.push("krams", "kramamoo", "kramamooo", "kram");
  }
  if (pLower === "om" || pLower === "omi") namesToCheck.push("om", "omi");
  
  return words.some(word => namesToCheck.includes(word));
};

// Global Helper: Timezone-safe robust date parsing
const parseDateToYYYYMMDD = (rawDate: string): string => {
  const clean = String(rawDate || "").trim();
  if (!clean) return "";

  // 1. Check for YYYY-MM-DD pattern
  const yyyymmdd = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (yyyymmdd) {
    return `${yyyymmdd[1]}-${yyyymmdd[2].padStart(2, '0')}-${yyyymmdd[3].padStart(2, '0')}`;
  }

  // 2. DD-MMM-YYYY or DD-MMM (e.g. 12-Apr-2026 or 12-Apr or 12-Apr-26)
  const ddmmyyyyPattern = clean.match(/^(\d{1,2})[-/ ]([a-zA-Z]{3,10})[-/ ]?(\d{2,4})?$/);
  if (ddmmyyyyPattern) {
    const day = parseInt(ddmmyyyyPattern[1]);
    const monthStr = ddmmyyyyPattern[2].toLowerCase();
    let year = ddmmyyyyPattern[3] ? parseInt(ddmmyyyyPattern[3]) : 2026;
    if (year < 100) year += 2000;

    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthIdx = months.findIndex(m => monthStr.startsWith(m));
    if (!isNaN(day) && monthIdx !== -1) {
      return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // 3. M/D/YYYY or D/M/YYYY with slashes
  const slashPattern = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (slashPattern) {
    const part1 = parseInt(slashPattern[1]);
    const part2 = parseInt(slashPattern[2]);
    let year = parseInt(slashPattern[3]);
    if (year < 100) year += 2000;

    let month = part1;
    let day = part2;
    if (part1 > 12) {
      month = part2;
      day = part1;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // 4. Excel/Google Sheets serial date fallback (e.g. 46124)
  if (/^\d{5}$/.test(clean)) {
    const serial = parseInt(clean);
    const utc_days  = serial - 25569;
    const utc_value = utc_days * 86400;
    const d = new Date(utc_value * 1000);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Fallback to local timezone Date parsing to avoid UTC offset subtraction
  try {
    const parsed = Date.parse(clean);
    if (!isNaN(parsed)) {
      const d = new Date(parsed);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    // ignore
  }

  return clean;
};

// API Endpoint to load all quarters and sessions from Google Sheets
app.post("/api/sheets/load", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header. Please sign in with Google." });
    }
    const accessToken = authHeader.split(" ")[1];

    const { category, players: rawPlayers = [] } = req.body;
    const players = rawPlayers.filter((p: any) => {
      if (category === "Kid") {
        return p.category === "Kid";
      } else {
        return p.category === "Adult" || !p.category;
      }
    });
    const spreadsheetId = category === "Kid" 
      ? "1cj02RjtHirJs5GELGQuM6kjBiMXfQ_1uK6pV-9OUyp8" 
      : "1YHzJuRgjUFCUqFuibXpb-ZiYIAyuXyZK2Wx_QDeTr9I";

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: "v4", auth });

    // Fetch spreadsheet details to get all sheet tabs
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetTabs = spreadsheet.data.sheets || [];

    const parsedQuarters: any[] = [];
    const parsedSessions: any[] = [];
    let sessionCounter = 1;

    for (let idx = 0; idx < sheetTabs.length; idx++) {
      const sheet = sheetTabs[idx];
      const title = sheet.properties?.title;
      if (!title) continue;

      // Skip non-quarter tabs
      const tLower = title.toLowerCase();
      if (tLower.includes("template") || tLower.includes("readme") || tLower.includes("sheet1")) {
        continue;
      }

      const quarterId = idx + 1;

      // Determine Quarter start and end dates
      let startDate = "2026-01-01";
      let endDate = "2026-03-31";

      if (tLower.includes("q2") || tLower.includes("quarter 2") || tLower.includes("apr") || tLower.includes("june")) {
        startDate = "2026-04-01";
        endDate = "2026-06-30";
      } else if (tLower.includes("q3") || tLower.includes("quarter 3") || tLower.includes("jul") || tLower.includes("sep")) {
        startDate = "2026-07-01";
        endDate = "2026-09-30";
      } else if (tLower.includes("q4") || tLower.includes("quarter 4") || tLower.includes("oct") || tLower.includes("dec")) {
        startDate = "2026-10-01";
        endDate = "2026-12-31";
      }

      parsedQuarters.push({
        id: quarterId,
        name: title,
        startDate,
        endDate
      });

      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `'${title}'!A1:Z100`,
        });

        const values = response.data.values;
        if (!values || values.length === 0) continue;

        const headers = values[0];
        const rows = values.slice(1);

        const dateIdx = headers.findIndex(h => {
          const lower = String(h || "").toLowerCase();
          return lower.includes("date") || lower.includes("dt") || lower.includes("day");
        });
        const typeIdx = headers.findIndex(h => {
          const lower = String(h || "").toLowerCase();
          return lower.includes("type") || lower.includes("description") || lower.includes("item") || lower.includes("particulars");
        });
        const feeIdx = headers.findIndex(h => {
          const lower = String(h || "").toLowerCase();
          return lower.includes("total") || lower.includes("fee") || lower.includes("amount") || lower.includes("price") || lower.includes("cost");
        });
        const paidByIdx = headers.findIndex(h => {
          const lower = String(h || "").toLowerCase();
          return lower.includes("paid") || lower.includes("payer") || lower.includes("buyer");
        });
        const attendeesCountIdx = headers.findIndex(h => {
          const lower = String(h || "").toLowerCase();
          return lower.includes("attendee") || lower.includes("count") || lower.includes("no. of players") || lower.includes("pax") || lower.includes("head count");
        });
        const commentIdx = headers.findIndex(h => {
          const lower = String(h || "").toLowerCase();
          return lower.includes("comment") || lower.includes("note") || lower.includes("remark") || lower.includes("comments");
        });

        const playerCols: { colIdx: number; name: string; playerIds: number[]; type: 'individual' | 'family' }[] = [];

        headers.forEach((headerName: string, idx: number) => {
          const hLower = String(headerName || "").trim().toLowerCase();
          if (!hLower) return;

          if (idx === dateIdx || idx === typeIdx || idx === feeIdx || idx === paidByIdx || idx === attendeesCountIdx || idx === commentIdx) {
            return;
          }
          if (hLower.includes("cost / person") || hLower.includes("total paid") || hLower.includes("to pay") || hLower.includes("total cost") || hLower.includes("receive") || hLower.includes("s no") || hLower.includes("total")) {
            return;
          }

          const matchingFamilyPlayers = players.filter((p: any) => p.family && p.family.trim().toLowerCase() === hLower);
          if (matchingFamilyPlayers.length > 0) {
            playerCols.push({
              colIdx: idx,
              name: headerName,
              playerIds: matchingFamilyPlayers.map((p: any) => p.id),
              type: 'family'
            });
            return;
          }

          const matchingPlayer = players.find((p: any) => p.name && isPlayerMatch(p.name, hLower));
          if (matchingPlayer) {
            playerCols.push({
              colIdx: idx,
              name: headerName,
              playerIds: [matchingPlayer.id],
              type: 'individual'
            });
            return;
          }

          if (hLower.includes("/")) {
            const parts = hLower.split("/");
            const ids: number[] = [];
            parts.forEach((part) => {
              const cleanPart = part.trim().toLowerCase();
              const p = players.find((player: any) => isPlayerMatch(player.name, cleanPart));
              if (p) {
                ids.push(p.id);
              }
            });
            if (ids.length > 0) {
              playerCols.push({
                colIdx: idx,
                name: headerName,
                playerIds: ids,
                type: 'family'
              });
              return;
            }
          }

          const foundSubPlayers = players.filter((p: any) => searchStrContainsPlayer(hLower, p.name) || searchStrContainsPlayer(p.name, hLower));
          if (foundSubPlayers.length > 0) {
            playerCols.push({
              colIdx: idx,
              name: headerName,
              playerIds: foundSubPlayers.map((p: any) => p.id),
              type: foundSubPlayers.length > 1 ? 'family' : 'individual'
            });
          }
        });

        playerCols.forEach((col) => {
          const hasFamily = col.playerIds.some((pId) => {
            const p = players.find((pl: any) => pl.id === pId);
            return p && p.family && p.family.trim();
          });

          if (hasFamily) {
            col.type = 'family';
            const expandedIds = [...col.playerIds];
            col.playerIds.forEach((pId) => {
              const p = players.find((pl: any) => pl.id === pId);
              if (p && p.family && p.family.trim()) {
                const famLower = p.family.trim().toLowerCase();
                players.forEach((otherP: any) => {
                  if (otherP.family && otherP.family.trim().toLowerCase() === famLower) {
                    if (!expandedIds.includes(otherP.id)) {
                      expandedIds.push(otherP.id);
                    }
                  }
                });
              }
            });
            col.playerIds = expandedIds;
          }
        });

        for (const row of rows) {
          if (row.length === 0) continue;

          const rawDate = dateIdx !== -1 ? String(row[dateIdx] || "").trim() : "";
          if (!rawDate) continue;

          const lowerDate = rawDate.toLowerCase();
          if (lowerDate.includes("total") || lowerDate.includes("to pay") || lowerDate.includes("balance") || lowerDate.includes("cost") || lowerDate.includes("checksum")) {
            continue;
          }

          const formattedDate = parseDateToYYYYMMDD(rawDate);
          const expenseType = typeIdx !== -1 ? String(row[typeIdx] || "").trim() || "Court Rental" : "Court Rental";

          let courtFee = 0;
          if (feeIdx !== -1) {
            const feeStr = String(row[feeIdx] || "").replace(/[^0-9.]/g, "");
            courtFee = parseFloat(feeStr) || 0;
          }

          const rawComment = commentIdx !== -1 ? String(row[commentIdx] || "").trim() : "";
          const attendeeIds: number[] = [];

          // 1. Check which registered players for this category are mentioned in rawComment
          const playersInComment = players.filter((p: any) => p && p.name && searchStrContainsPlayer(rawComment, p.name));

          if (playersInComment.length > 0) {
            // Primary source: The comment column explicitly lists the session attendees
            playersInComment.forEach((p: any) => {
              if (!attendeeIds.includes(p.id)) {
                attendeeIds.push(p.id);
              }
            });
          } else {
            // Fallback: Infer attendees from columns with non-zero amounts
            playerCols.forEach((col) => {
              if (col.colIdx >= row.length) return;
              const val = String(row[col.colIdx] || "").trim();
              if (val && val !== "0" && val !== "0.00" && val !== "-") {
                const validColPlayerIds = col.playerIds.filter((pId) => players.some((pl: any) => pl.id === pId));
                if (col.type === 'individual') {
                  validColPlayerIds.forEach((pId) => {
                    if (!attendeeIds.includes(pId)) attendeeIds.push(pId);
                  });
                } else {
                  let count = 1;
                  if (attendeesCountIdx !== -1 && row[attendeesCountIdx]) {
                    const totalAttCount = parseInt(row[attendeesCountIdx]) || 1;
                    const costPerPerson = courtFee / totalAttCount;
                    const cellVal = parseFloat(val.replace(/[^0-9.]/g, "")) || 0;
                    if (costPerPerson > 0 && cellVal > 0) {
                      count = Math.round(cellVal / costPerPerson);
                      if (count < 1) count = 1;
                    }
                  }
                  const toAdd = validColPlayerIds.slice(0, count);
                  toAdd.forEach((pId) => {
                    if (!attendeeIds.includes(pId)) attendeeIds.push(pId);
                  });
                }
              }
            });
          }

          // 2. Determine paidById
          const paidByStr = paidByIdx !== -1 ? String(row[paidByIdx] || "").trim() : "";
          let paidById: number | null = null;
          if (paidByStr) {
            const pMatch = players.find((p: any) => isPlayerMatch(p.name, paidByStr));
            if (pMatch) {
              paidById = pMatch.id;
            } else {
              const subMatch = players.find((p: any) => searchStrContainsPlayer(paidByStr, p.name) || searchStrContainsPlayer(p.name, paidByStr));
              if (subMatch) {
                paidById = subMatch.id;
              }
            }
          }

          // Fallback paidById if not found or invalid
          if (paidById == null || !players.some((p: any) => p.id === paidById)) {
            if (attendeeIds.length > 0) {
              paidById = attendeeIds[0];
            } else if (players.length > 0) {
              paidById = players[0].id;
            } else {
              paidById = 1;
            }
          }

          const attendeeNames = attendeeIds
            .map((id) => players.find((p) => p.id === id)?.name || '')
            .filter((name) => name !== '')
            .join(', ');

          parsedSessions.push({
            id: sessionCounter++,
            quarterId,
            date: formattedDate,
            courtFee,
            attendeeIds,
            paidById,
            shares: [],
            expenseType,
            comment: attendeeNames || rawComment
          });
        }
      } catch (err: any) {
        console.error(`Error parsing sheet tab ${title}:`, err);
      }
    }

    res.json({
      success: true,
      quarters: parsedQuarters,
      sessions: parsedSessions
    });
  } catch (error: any) {
    console.error("Error loading sheet data:", error);
    res.status(500).json({ error: error.message || "Failed to load sheet data" });
  }
});

// API Endpoint to import Sessions from an existing Google Sheet
app.post("/api/sheets/import", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header. Please sign in with Google." });
    }
    const accessToken = authHeader.split(" ")[1];

    const {
      spreadsheetId,
      sheetName = "Apr-June-2026",
      quarterId,
      players: rawPlayers = [],
      category: passedCategory
    } = req.body;

    const resolvedCategory = passedCategory || (spreadsheetId === "1cj02RjtHirJs5GELGQuM6kjBiMXfQ_1uK6pV-9OUyp8" ? "Kid" : "Adult");
    const players = rawPlayers.filter((p: any) => {
      if (resolvedCategory === "Kid") {
        return p.category === "Kid";
      } else {
        return p.category === "Adult" || !p.category;
      }
    });

    if (!spreadsheetId) {
      return res.status(400).json({ error: "Spreadsheet ID is required for import." });
    }

    if (!quarterId) {
      return res.status(400).json({ error: "quarterId is required to target import sessions." });
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: "v4", auth });

    // Fetch values from the specified Google Sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A1:Z100`,
    });

    const values = response.data.values;
    if (!values || values.length === 0) {
      return res.status(404).json({ error: `No data found in sheet tab: ${sheetName}` });
    }

    const headers = values[0];
    const rows = values.slice(1);

    // Identify standard columns by name
    const dateIdx = headers.findIndex(h => {
      const lower = String(h || "").toLowerCase();
      return lower.includes("date") || lower.includes("dt") || lower.includes("day");
    });
    const typeIdx = headers.findIndex(h => {
      const lower = String(h || "").toLowerCase();
      return lower.includes("type") || lower.includes("description") || lower.includes("item");
    });
    const feeIdx = headers.findIndex(h => {
      const lower = String(h || "").toLowerCase();
      return lower.includes("total") || lower.includes("fee") || lower.includes("amount") || lower.includes("price") || lower.includes("cost");
    });
    const paidByIdx = headers.findIndex(h => {
      const lower = String(h || "").toLowerCase();
      return lower.includes("paid") || lower.includes("payer") || lower.includes("buyer");
    });
    const attendeesCountIdx = headers.findIndex(h => {
      const lower = String(h || "").toLowerCase();
      return lower.includes("attendee") || lower.includes("count") || lower.includes("no. of players") || lower.includes("pax");
    });
    const commentIdx = headers.findIndex(h => {
      const lower = String(h || "").toLowerCase();
      return lower.includes("comment") || lower.includes("note") || lower.includes("remark");
    });

    // Map other columns to players or family columns
    const playerCols: { colIdx: number; name: string; playerIds: number[]; type: 'individual' | 'family' }[] = [];

    headers.forEach((headerName: string, idx: number) => {
      const hLower = String(headerName || "").trim().toLowerCase();
      if (!hLower) return;

      // Skip non-player columns
      if (idx === dateIdx || idx === typeIdx || idx === feeIdx || idx === paidByIdx || idx === attendeesCountIdx || idx === commentIdx) {
        return;
      }
      if (hLower.includes("cost / person") || hLower.includes("total paid") || hLower.includes("to pay") || hLower.includes("total cost") || hLower.includes("receive")) {
        return;
      }

      // 0. Exact match with any player's family name (case-insensitive)
      const matchingFamilyPlayers = players.filter((p: any) => p.family && p.family.trim().toLowerCase() === hLower);
      if (matchingFamilyPlayers.length > 0) {
        playerCols.push({
          colIdx: idx,
          name: headerName,
          playerIds: matchingFamilyPlayers.map((p: any) => p.id),
          type: 'family'
        });
        return;
      }

      // 1. Exact match with individual player name or custom nickname
      const matchingPlayer = players.find((p: any) => p.name && isPlayerMatch(p.name, hLower));
      if (matchingPlayer) {
        playerCols.push({
          colIdx: idx,
          name: headerName,
          playerIds: [matchingPlayer.id],
          type: 'individual'
        });
        return;
      }

      // 2. Family columns (e.g. Krams/Abhaya)
      if (hLower.includes("/")) {
        const parts = hLower.split("/");
        const ids: number[] = [];
        parts.forEach((part) => {
          const cleanPart = part.trim().toLowerCase();
          const p = players.find((player: any) => isPlayerMatch(player.name, cleanPart));
          if (p) {
            ids.push(p.id);
          }
        });
        if (ids.length > 0) {
          playerCols.push({
            colIdx: idx,
            name: headerName,
            playerIds: ids,
            type: 'family'
          });
          return;
        }
      }

      // 3. Substring or nickname fallback match
      const foundSubPlayers = players.filter((p: any) => searchStrContainsPlayer(hLower, p.name) || searchStrContainsPlayer(p.name, hLower));
      if (foundSubPlayers.length > 0) {
        playerCols.push({
          colIdx: idx,
          name: headerName,
          playerIds: foundSubPlayers.map((p: any) => p.id),
          type: foundSubPlayers.length > 1 ? 'family' : 'individual'
        });
      }
    });

    // Expand player lists for columns to include all members of their family unit,
    // and promote 'individual' columns to 'family' if the player belongs to a family unit.
    playerCols.forEach((col) => {
      const hasFamily = col.playerIds.some((pId) => {
        const p = players.find((pl: any) => pl.id === pId);
        return p && p.family && p.family.trim();
      });

      if (hasFamily) {
        col.type = 'family';
        const expandedIds = [...col.playerIds];
        col.playerIds.forEach((pId) => {
          const p = players.find((pl: any) => pl.id === pId);
          if (p && p.family && p.family.trim()) {
            const famLower = p.family.trim().toLowerCase();
            players.forEach((otherP: any) => {
              if (otherP.family && otherP.family.trim().toLowerCase() === famLower) {
                if (!expandedIds.includes(otherP.id)) {
                  expandedIds.push(otherP.id);
                }
              }
            });
          }
        });
        col.playerIds = expandedIds;
      }
    });

    const parsedSessions: any[] = [];

    for (const row of rows) {
      if (row.length === 0) continue;

      const rawDate = dateIdx !== -1 ? String(row[dateIdx] || "").trim() : "";
      if (!rawDate) continue;

      // Skip summary rows
      const lowerDate = rawDate.toLowerCase();
      if (lowerDate.includes("total") || lowerDate.includes("to pay") || lowerDate.includes("balance") || lowerDate.includes("cost")) {
        continue;
      }

      // Timezone-safe date normalization
      const formattedDate = parseDateToYYYYMMDD(rawDate);

      const expenseType = typeIdx !== -1 ? String(row[typeIdx] || "").trim() || "Court Rental" : "Court Rental";

      let courtFee = 0;
      if (feeIdx !== -1) {
        const feeStr = String(row[feeIdx] || "").replace(/[^0-9.]/g, "");
        courtFee = parseFloat(feeStr) || 0;
      }

      const rawComment = commentIdx !== -1 ? String(row[commentIdx] || "").trim() : "";
      const attendeeIds: number[] = [];

      // 1. Check which registered players for this category are mentioned in rawComment
      const playersInComment = players.filter((p: any) => p && p.name && searchStrContainsPlayer(rawComment, p.name));

      if (playersInComment.length > 0) {
        // Primary source: The comment column explicitly lists the session attendees
        playersInComment.forEach((p: any) => {
          if (!attendeeIds.includes(p.id)) {
            attendeeIds.push(p.id);
          }
        });
      } else {
        // Fallback: Infer attendees from columns with non-zero amounts
        playerCols.forEach((col) => {
          if (col.colIdx >= row.length) return;
          const val = String(row[col.colIdx] || "").trim();
          if (val && val !== "0" && val !== "0.00" && val !== "-") {
            const validColPlayerIds = col.playerIds.filter((pId) => players.some((pl: any) => pl.id === pId));
            if (col.type === 'individual') {
              validColPlayerIds.forEach((pId) => {
                if (!attendeeIds.includes(pId)) attendeeIds.push(pId);
              });
            } else {
              let count = 1;
              if (attendeesCountIdx !== -1 && row[attendeesCountIdx]) {
                const totalAttCount = parseInt(row[attendeesCountIdx]) || 1;
                const costPerPerson = courtFee / totalAttCount;
                const cellVal = parseFloat(val.replace(/[^0-9.]/g, "")) || 0;
                if (costPerPerson > 0 && cellVal > 0) {
                  count = Math.round(cellVal / costPerPerson);
                  if (count < 1) count = 1;
                }
              }
              const toAdd = validColPlayerIds.slice(0, count);
              toAdd.forEach((pId) => {
                if (!attendeeIds.includes(pId)) attendeeIds.push(pId);
              });
            }
          }
        });
      }

      // 2. Determine paidById
      const paidByStr = paidByIdx !== -1 ? String(row[paidByIdx] || "").trim() : "";
      let paidById: number | null = null;
      if (paidByStr) {
        const pMatch = players.find((p: any) => isPlayerMatch(p.name, paidByStr));
        if (pMatch) {
          paidById = pMatch.id;
        } else {
          const subMatch = players.find((p: any) => searchStrContainsPlayer(paidByStr, p.name) || searchStrContainsPlayer(p.name, paidByStr));
          if (subMatch) {
            paidById = subMatch.id;
          }
        }
      }

      // Fallback paidById if not found or invalid
      if (paidById == null || !players.some((p: any) => p.id === paidById)) {
        if (attendeeIds.length > 0) {
          paidById = attendeeIds[0];
        } else if (players.length > 0) {
          paidById = players[0].id;
        } else {
          paidById = 1;
        }
      }

      // Generate the comment string listing the actual attendees for clean display in app
      const attendeeNames = attendeeIds
        .map((id) => players.find((p) => p.id === id)?.name || '')
        .filter((name) => name !== '')
        .join(', ');

      parsedSessions.push({
        quarterId: Number(quarterId),
        date: formattedDate,
        courtFee,
        attendeeIds,
        paidById,
        expenseType,
        comment: attendeeNames || rawComment
      });
    }

    res.json({
      success: true,
      sessions: parsedSessions
    });
  } catch (error: any) {
    console.error("Error importing sheet data:", error);
    res.status(500).json({ error: error.message || "Failed to import sheet data" });
  }
});

// Serve static assets
app.use(express.static(staticPath));

// Support SPA routing (any unmatched route serves index.html)
app.get("*", (req, res) => {
  // If the request path looks like a file/asset (has an extension), return a 404 instead of serving index.html
  const ext = path.extname(req.path);
  if (ext) {
    return res.status(404).end();
  }
  res.sendFile(path.join(staticPath, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

