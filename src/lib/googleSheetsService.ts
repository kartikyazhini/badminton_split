import { Player, Quarter, Session } from '../types';

// Global Helper: Get Google Sheets column letter for 0-based column index
export const getColumnLetter = (colIdx: number): string => {
  let temp = colIdx;
  let letter = "";
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
};

// Global Helper: Match player names or custom nicknames
export const isPlayerMatch = (playerName: string, searchStr: string): boolean => {
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
export const searchStrContainsPlayer = (searchStr: string, playerName: string): boolean => {
  const sLower = String(searchStr || "").toLowerCase().trim();
  const pLower = String(playerName || "").toLowerCase().trim();

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
export const parseDateToYYYYMMDD = (rawDate: string): string => {
  const clean = String(rawDate || "").trim();
  if (!clean) return "";

  // 1. Check for YYYY-MM-DD pattern
  const yyyymmdd = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (yyyymmdd) {
    return `${yyyymmdd[1]}-${yyyymmdd[2].padStart(2, '0')}-${yyyymmdd[3].padStart(2, '0')}`;
  }

  // 2. DD-MMM-YYYY or DD-MMM
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

  // 3. M/D/YYYY or D/M/YYYY
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

  // 4. Excel/Google Sheets serial date
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

export async function syncToGoogleSheets(params: {
  token: string;
  spreadsheetId?: string;
  fileName?: string;
  sheetName?: string;
  syncQuarterId?: number;
  quarters: Quarter[];
  players: Player[];
  sessions: Session[];
}): Promise<{ success: boolean; spreadsheetId: string }> {
  const { token, quarters = [], players = [], sessions = [], fileName, sheetName, syncQuarterId } = params;
  let resolvedSpreadsheetId = params.spreadsheetId;

  const authHeader = { Authorization: `Bearer ${token}` };

  // Resolve spreadsheetId by fileName if provided
  if (fileName && fileName.trim()) {
    try {
      const q = encodeURIComponent(`name = '${fileName.trim().replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`);
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id%2Cname)&spaces=drive`,
        { headers: authHeader }
      );
      if (!driveRes.ok) {
        throw new Error(`Drive search failed with status ${driveRes.status}`);
      }
      const driveData = await driveRes.json();
      const files = driveData.files || [];
      if (files.length > 0) {
        resolvedSpreadsheetId = files[0].id;
      } else {
        const createRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            properties: { title: fileName.trim() }
          })
        });
        if (!createRes.ok) {
          throw new Error(`Failed to create spreadsheet with status ${createRes.status}`);
        }
        const createData = await createRes.json();
        resolvedSpreadsheetId = createData.spreadsheetId;
      }
    } catch (err: any) {
      throw new Error(`Could not search or create spreadsheet named "${fileName}": ${err.message}`);
    }
  }

  if (!resolvedSpreadsheetId) {
    throw new Error("Spreadsheet ID or File Name is required.");
  }

  // Fetch spreadsheet details
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${resolvedSpreadsheetId}?fields=sheets(properties(sheetId%2Ctitle))`, {
    headers: authHeader
  });
  if (!metaRes.ok) {
    throw new Error(`Failed to fetch spreadsheet details (${metaRes.status}). Check permissions or spreadsheet ID.`);
  }
  const metaData = await metaRes.json();
  const existingSheets = metaData.sheets || [];
  const existingTitles = existingSheets.map((s: any) => s.properties?.title).filter(Boolean) as string[];

  // Map of players by ID
  const playerMap = new Map<number, string>();
  players.forEach((p: any) => {
    if (p && p.id != null) {
      playerMap.set(p.id, p.name || `Player #${p.id}`);
    }
  });

  const targetQuarter = syncQuarterId ? quarters.find((q: any) => q.id === Number(syncQuarterId)) : null;
  const filteredSessions = targetQuarter ? sessions.filter((s: any) => s.quarterId === targetQuarter.id) : sessions;

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

  if (requests.length > 0) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${resolvedSpreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests })
    });
  }

  // Re-fetch sheet list to get updated sheetIds
  const freshRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${resolvedSpreadsheetId}?fields=sheets(properties(sheetId%2Ctitle))`, {
    headers: authHeader
  });
  const freshData = await freshRes.json();
  const freshSheets = freshData.sheets || [];

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
      const matchingCol = sheetColumns.find(
        (c) => c.name && c.name.toLowerCase() === hLower
      );
      if (matchingCol) {
        return Number((columnTotals[matchingCol.name] || 0).toFixed(2));
      }
      return "";
    }

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

  for (const target of syncTargets) {
    const title = target.title;
    const qSessions = target.sessions;

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
        rows.push(Array.from({ length: maxCols }).map(() => ""));
      }
    }

    rows.push(Array.from({ length: maxCols }).map(() => ""));
    rows.push(Array.from({ length: maxCols }).map(() => ""));
    rows.push(Array.from({ length: maxCols }).map(() => ""));

    const totalPaidRow = Array.from({ length: maxCols }).map((_, idx) => {
      if (idx === 4) return "Total Paid";
      if (idx === 2) return "=SUM(C2:C42)";

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

    const totalCostRow = Array.from({ length: maxCols }).map((_, idx) => {
      if (idx === 4) return "Total Cost";
      if (idx === 2) return "=SUM(C2:C42)";

      if (idx >= 6 && idx < 6 + sheetColumns.length) {
        const colLetter = getColumnLetter(idx);
        return `=SUM(${colLetter}2:${colLetter}42)`;
      }
      return "";
    });

    const toPayReceiveRow = Array.from({ length: maxCols }).map((_, idx) => {
      if (idx === 4) return "To Pay/(Receive)";
      if (idx === 2) return "=C47-C46";

      if (idx >= 6 && idx < 6 + sheetColumns.length) {
        const colLetter = getColumnLetter(idx);
        return `=${colLetter}47-${colLetter}46`;
      }
      return "";
    });

    rows.push(totalPaidRow, totalCostRow, toPayReceiveRow);

    // Clear range
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${resolvedSpreadsheetId}/values/'${encodeURIComponent(title)}'!A1:ZZ5000:clear`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    // Write updated values
    const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${resolvedSpreadsheetId}/values/'${encodeURIComponent(title)}'!A1?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows })
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`Failed to update sheet values (${updateRes.status}): ${errText}`);
    }

    // Formatting
    const currentSheetObj = freshSheets.find((s: any) => s.properties?.title === title);
    const sheetId = currentSheetObj?.properties?.sheetId;

    if (sheetId !== undefined && sheetId !== null) {
      const formattingRequests: any[] = [
        {
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
                backgroundColor: { red: 30/255, green: 41/255, blue: 59/255 },
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
        },
        {
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
        }
      ];

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${resolvedSpreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: formattingRequests })
      });
    }
  }

  return { success: true, spreadsheetId: resolvedSpreadsheetId };
}

export async function importFromGoogleSheets(params: {
  token: string;
  spreadsheetId: string;
  sheetName: string;
  quarterId: number;
  players: Player[];
  category?: string;
}): Promise<{ success: boolean; sessions: Session[] }> {
  const { token, spreadsheetId, sheetName, quarterId, players: rawPlayers = [], category } = params;

  const players = rawPlayers.filter((p: any) => {
    if (category === "Kid") {
      return p.category === "Kid";
    } else {
      return p.category === "Adult" || !p.category;
    }
  });

  const authHeader = { Authorization: `Bearer ${token}` };

  const rangeRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(sheetName)}'!A1:Z100`, {
    headers: authHeader
  });

  if (!rangeRes.ok) {
    const errText = await rangeRes.text();
    throw new Error(`Failed to fetch sheet data (${rangeRes.status}): ${errText}`);
  }

  const rangeData = await rangeRes.json();
  const values = rangeData.values;

  if (!values || values.length === 0) {
    return { success: true, sessions: [] };
  }

  const headers = values[0];
  const rows = values.slice(1);

  const dateIdx = headers.findIndex((h: string) => {
    const lower = String(h || "").toLowerCase();
    return lower.includes("date") || lower.includes("dt") || lower.includes("day");
  });
  const typeIdx = headers.findIndex((h: string) => {
    const lower = String(h || "").toLowerCase();
    return lower.includes("type") || lower.includes("description") || lower.includes("item") || lower.includes("particulars");
  });
  const feeIdx = headers.findIndex((h: string) => {
    const lower = String(h || "").toLowerCase();
    return lower.includes("total") || lower.includes("fee") || lower.includes("amount") || lower.includes("price") || lower.includes("cost");
  });
  const paidByIdx = headers.findIndex((h: string) => {
    const lower = String(h || "").toLowerCase();
    return lower.includes("paid") || lower.includes("payer") || lower.includes("buyer");
  });
  const attendeesCountIdx = headers.findIndex((h: string) => {
    const lower = String(h || "").toLowerCase();
    return lower.includes("attendee") || lower.includes("count") || lower.includes("no. of players") || lower.includes("pax") || lower.includes("head count");
  });
  const commentIdx = headers.findIndex((h: string) => {
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

  const parsedSessions: Session[] = [];

  for (const row of rows) {
    if (row.length === 0) continue;

    const rawDate = dateIdx !== -1 ? String(row[dateIdx] || "").trim() : "";
    if (!rawDate) continue;

    const lowerDate = rawDate.toLowerCase();
    if (lowerDate.includes("total") || lowerDate.includes("to pay") || lowerDate.includes("balance") || lowerDate.includes("cost")) {
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

    const playersInComment = players.filter((p: any) => p && p.name && searchStrContainsPlayer(rawComment, p.name));

    if (playersInComment.length > 0) {
      playersInComment.forEach((p: any) => {
        if (!attendeeIds.includes(p.id)) {
          attendeeIds.push(p.id);
        }
      });
    } else {
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
      quarterId: Number(quarterId),
      date: formattedDate,
      courtFee,
      attendeeIds,
      paidById,
      expenseType,
      comment: attendeeNames || rawComment
    });
  }

  return { success: true, sessions: parsedSessions };
}

export async function loadFromGoogleSheets(params: {
  token: string;
  category: 'Adult' | 'Kid';
  players: Player[];
}): Promise<{ quarters: Quarter[]; sessions: Session[] }> {
  const { token, category, players: rawPlayers = [] } = params;
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

  const authHeader = { Authorization: `Bearer ${token}` };

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId%2Ctitle))`, {
    headers: authHeader
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to fetch spreadsheet details (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const sheetTabs = data.sheets || [];

  const parsedQuarters: Quarter[] = [];
  const parsedSessions: Session[] = [];
  let sessionCounter = 1;

  for (let idx = 0; idx < sheetTabs.length; idx++) {
    const sheet = sheetTabs[idx];
    const title = sheet.properties?.title;
    if (!title) continue;

    const tLower = title.toLowerCase();
    if (tLower.includes("template") || tLower.includes("readme") || tLower.includes("sheet1")) {
      continue;
    }

    const quarterId = idx + 1;

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
      const rangeRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(title)}'!A1:Z100`, {
        headers: authHeader
      });

      if (!rangeRes.ok) continue;

      const rangeData = await rangeRes.json();
      const values = rangeData.values;
      if (!values || values.length === 0) continue;

      const headers = values[0];
      const rows = values.slice(1);

      const dateIdx = headers.findIndex((h: any) => {
        const lower = String(h || "").toLowerCase();
        return lower.includes("date") || lower.includes("dt") || lower.includes("day");
      });
      const typeIdx = headers.findIndex((h: any) => {
        const lower = String(h || "").toLowerCase();
        return lower.includes("type") || lower.includes("description") || lower.includes("item") || lower.includes("particulars");
      });
      const feeIdx = headers.findIndex((h: any) => {
        const lower = String(h || "").toLowerCase();
        return lower.includes("total") || lower.includes("fee") || lower.includes("amount") || lower.includes("price") || lower.includes("cost");
      });
      const paidByIdx = headers.findIndex((h: any) => {
        const lower = String(h || "").toLowerCase();
        return lower.includes("paid") || lower.includes("payer") || lower.includes("buyer");
      });
      const attendeesCountIdx = headers.findIndex((h: any) => {
        const lower = String(h || "").toLowerCase();
        return lower.includes("attendee") || lower.includes("count") || lower.includes("no. of players") || lower.includes("pax") || lower.includes("head count");
      });
      const commentIdx = headers.findIndex((h: any) => {
        const lower = String(h || "").toLowerCase();
        return lower.includes("comment") || lower.includes("note") || lower.includes("remark") || lower.includes("comments");
      });

      const playerCols: { colIdx: number; name: string; playerIds: number[]; type: 'individual' | 'family' }[] = [];

      headers.forEach((headerName: string, hIdx: number) => {
        const hLower = String(headerName || "").trim().toLowerCase();
        if (!hLower) return;

        if (hIdx === dateIdx || hIdx === typeIdx || hIdx === feeIdx || hIdx === paidByIdx || hIdx === attendeesCountIdx || hIdx === commentIdx) {
          return;
        }
        if (hLower.includes("cost / person") || hLower.includes("total paid") || hLower.includes("to pay") || hLower.includes("total cost") || hLower.includes("receive") || hLower.includes("s no") || hLower.includes("total")) {
          return;
        }

        const matchingFamilyPlayers = players.filter((p: any) => p.family && p.family.trim().toLowerCase() === hLower);
        if (matchingFamilyPlayers.length > 0) {
          playerCols.push({
            colIdx: hIdx,
            name: headerName,
            playerIds: matchingFamilyPlayers.map((p: any) => p.id),
            type: 'family'
          });
          return;
        }

        const matchingPlayer = players.find((p: any) => p.name && isPlayerMatch(p.name, hLower));
        if (matchingPlayer) {
          playerCols.push({
            colIdx: hIdx,
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
              colIdx: hIdx,
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
            colIdx: hIdx,
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
        if (lowerDate.includes("total") || lowerDate.includes("to pay") || lowerDate.includes("balance") || lowerDate.includes("cost")) {
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

        const playersInComment = players.filter((p: any) => p && p.name && searchStrContainsPlayer(rawComment, p.name));

        if (playersInComment.length > 0) {
          playersInComment.forEach((p: any) => {
            if (!attendeeIds.includes(p.id)) {
              attendeeIds.push(p.id);
            }
          });
        } else {
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
          quarterId: Number(quarterId),
          date: formattedDate,
          courtFee,
          attendeeIds,
          paidById,
          expenseType,
          comment: attendeeNames || rawComment
        });
      }
    } catch (e) {
      console.error(`Error parsing tab ${title}:`, e);
    }
  }

  return { quarters: parsedQuarters, sessions: parsedSessions };
}

