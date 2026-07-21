import React, { useState, useEffect } from 'react';
import { getFirebaseAuth, provider, signInWithPopup, signOut, GoogleAuthProvider } from '../lib/firebase';
import { Player, Quarter, Session } from '../types';
import { Cloud, CloudCheck, CloudLightning, RefreshCw, LogIn, LogOut, FileSpreadsheet, Download, FolderOpen, Search, X } from 'lucide-react';
import { getApiUrl } from '../lib/api';

interface SheetsSyncProps {
  quarters: Quarter[];
  players: Player[];
  sessions: Session[];
  onImportSessions: (imported: Session[]) => void;
  selectedQuarterId?: number;
  category: 'Adult' | 'Kid';
  onTokenChange?: (token: string | null) => void;
}

export default function SheetsSync({
  quarters,
  players,
  sessions,
  onImportSessions,
  selectedQuarterId,
  category,
  onTokenChange
}: SheetsSyncProps) {
  const [auth, setAuth] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('google_access_token'));
  const [spreadsheetId, setSpreadsheetId] = useState<string>(() => {
    return category === 'Kid'
      ? '1cj02RjtHirJs5GELGQuM6kjBiMXfQ_1uK6pV-9OUyp8'
      : '1YHzJuRgjUFCUqFuibXpb-ZiYIAyuXyZK2Wx_QDeTr9I';
  });
  const [syncStatus, setSyncStatus] = useState<{
    text: string;
    type: 'success' | 'loading' | 'error' | 'idle';
  }>({ text: 'Sign in to sync with Google Sheets', type: 'idle' });
  // Sync token with parent
  useEffect(() => {
    onTokenChange?.(token);
  }, [token, onTokenChange]);

  // Sync spreadsheetId with category
  useEffect(() => {
    const targetId = category === 'Kid'
      ? '1cj02RjtHirJs5GELGQuM6kjBiMXfQ_1uK6pV-9OUyp8'
      : '1YHzJuRgjUFCUqFuibXpb-ZiYIAyuXyZK2Wx_QDeTr9I';
    setSpreadsheetId(targetId);
  }, [category]);

  const [showImport, setShowImport] = useState(false);
  const [importSpreadsheetId, setImportSpreadsheetId] = useState<string>(
    localStorage.getItem('import_spreadsheet_id') || localStorage.getItem('spreadsheet_id') || ''
  );
  const [importSheetName, setImportSheetName] = useState<string>(
    localStorage.getItem('import_sheet_name') || ''
  );
  const [importQuarterId, setImportQuarterId] = useState<string>('');
  const [importStatus, setImportStatus] = useState<{
    text: string;
    type: 'success' | 'loading' | 'error' | 'idle';
  }>({ text: '', type: 'idle' });
  
  // Custom Google Drive File Explorer State
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveFiles, setDriveFiles] = useState<{ id: string; name: string; modifiedTime?: string }[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveSearch, setDriveSearch] = useState('');
  const [onSelectCallback, setOnSelectCallback] = useState<((id: string, name?: string) => void) | null>(null);

  useEffect(() => {
    if (quarters.length > 0 && !importQuarterId) {
      const q2 = quarters.find(q => q.name.toLowerCase().includes('q2') || q.name.toLowerCase().includes('quarter 2') || q.name.toLowerCase().includes('apr-june'));
      if (q2) {
        setImportQuarterId(String(q2.id));
      } else {
        setImportQuarterId(String(quarters[0].id));
      }
    }
  }, [quarters, importQuarterId]);

  useEffect(() => {
    async function init() {
      const authClient = await getFirebaseAuth();
      if (authClient) {
        setAuth(authClient);
        authClient.onAuthStateChanged((currentUser: any) => {
          setUser(currentUser);
          if (currentUser) {
            const localToken = localStorage.getItem('google_access_token');
            if (localToken) {
              setToken(localToken);
            }
          } else {
            if (!localStorage.getItem('google_access_token')) {
              setToken(null);
            }
          }
        });
      }
    }
    init();
  }, []);

  const triggerSync = async (currentToken = token) => {
    const activeToken = currentToken || localStorage.getItem('google_access_token');
    if (!activeToken) {
      setSyncStatus({ text: 'Not signed in to Google', type: 'error' });
      return;
    }

    try {
      setSyncStatus({ text: 'Syncing to Google Sheets...', type: 'loading' });
      
      const targetSpreadsheetId = category === 'Kid'
        ? '1cj02RjtHirJs5GELGQuM6kjBiMXfQ_1uK6pV-9OUyp8'
        : '1YHzJuRgjUFCUqFuibXpb-ZiYIAyuXyZK2Wx_QDeTr9I';

      const filteredPlayers = players.filter(p => {
        if (category === 'Kid') {
          return p.category === 'Kid';
        } else {
          return p.category === 'Adult' || !p.category;
        }
      });

      const payload: any = {
        quarters,
        players: filteredPlayers,
        sessions,
        spreadsheetId: targetSpreadsheetId
      };

      if (selectedQuarterId) {
        payload.syncQuarterId = Number(selectedQuarterId);
      }

      const response = await fetch(getApiUrl('/api/sheets/sync'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (response.ok) {
        setSyncStatus({ text: `Synced with Google Sheets (${category === 'Kid' ? 'Kids' : 'Adults'}) successfully!`, type: 'success' });
      } else {
        setSyncStatus({ text: `Sync failed: ${data.error || 'Unknown error'}`, type: 'error' });
      }
    } catch (err: any) {
      console.error('Sync error:', err);
      setSyncStatus({ text: `Sync error: ${err.message || 'Failed to connect'}`, type: 'error' });
    }
  };

  const handleSignIn = async () => {
    if (!auth) {
      setSyncStatus({ text: 'Firebase authentication not ready', type: 'error' });
      return;
    }

    try {
      setSyncStatus({ text: 'Signing in to Google...', type: 'loading' });
      const result = await signInWithPopup(auth, provider);
      const credential = (GoogleAuthProvider as any).credentialFromResult(result);
      if (credential && credential.accessToken) {
        const accessToken = credential.accessToken;
        setToken(accessToken);
        localStorage.setItem('google_access_token', accessToken);
        setSyncStatus({ text: 'Connected to Google Sheets! Click "Sync Now" to start syncing.', type: 'success' });
      } else {
        setSyncStatus({ text: 'Authentication succeeded but failed to obtain Sheets token', type: 'error' });
      }
    } catch (err: any) {
      console.error('Sign in error:', err);
      setSyncStatus({ text: `Sign in failed: ${err.message || 'Error'}`, type: 'error' });
    }
  };

  const handleSignOut = async () => {
    if (auth) {
      await signOut(auth);
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('google_access_token');
    setSyncStatus({ text: 'Signed out. Sign in to sync with Google Sheets', type: 'idle' });
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setImportStatus({ text: 'Not signed in to Google.', type: 'error' });
      return;
    }
    if (!importQuarterId) {
      setImportStatus({ text: 'Please select a target quarter.', type: 'error' });
      return;
    }

    // Save to localStorage so they are remembered
    localStorage.setItem('import_spreadsheet_id', importSpreadsheetId);
    localStorage.setItem('import_sheet_name', importSheetName);

    try {
      setImportStatus({ text: 'Connecting to Google Sheets and parsing entries...', type: 'loading' });
      const response = await fetch(getApiUrl('/api/sheets/import'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          spreadsheetId: importSpreadsheetId,
          sheetName: importSheetName,
          quarterId: Number(importQuarterId),
          players: players.filter(p => {
            if (category === 'Kid') {
              return p.category === 'Kid';
            } else {
              return p.category === 'Adult' || !p.category;
            }
          }),
          category
        })
      });

      const data = await response.json();
      if (response.ok) {
        onImportSessions(data.sessions);
        setImportStatus({
          text: `Successfully imported ${data.sessions.length} sessions into selected quarter!`,
          type: 'success'
        });
        setTimeout(() => {
          setShowImport(false);
          setImportStatus({ text: '', type: 'idle' });
        }, 3000);
      } else {
        setImportStatus({ text: `Import failed: ${data.error || 'Unknown error'}`, type: 'error' });
      }
    } catch (err: any) {
      console.error('Import error:', err);
      setImportStatus({ text: `Import error: ${err.message || 'Failed to connect'}`, type: 'error' });
    }
  };

  const openDriveBrowser = async (onSelect: (id: string, name?: string) => void) => {
    if (!token) {
      alert('Please connect to Google first by clicking "Connect Google Sheets".');
      return;
    }
    setOnSelectCallback(() => onSelect);
    setShowDriveModal(true);
    setDriveLoading(true);
    setDriveError(null);
    setDriveSearch('');
    
    try {
      // Query Google Drive API for Google Sheets spreadsheets
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=mimeType%3D'application%2Fvnd.google-apps.spreadsheet'&fields=files(id%2Cname%2CmodifiedTime)&orderBy=modifiedTime%20desc`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Unauthorized access. Please try reconnecting your Google account.');
        }
        throw new Error(`Failed to fetch files (Status: ${res.status})`);
      }
      
      const data = await res.json();
      setDriveFiles(data.files || []);
    } catch (err: any) {
      console.error('Error listing Drive spreadsheets:', err);
      setDriveError(err.message || 'Failed to list spreadsheets from your Google Drive.');
    } finally {
      setDriveLoading(false);
    }
  };

  // Helper to get sync status styles
  const getStatusColor = () => {
    switch (syncStatus.type) {
      case 'success':
        return 'bg-emerald-500 text-emerald-500 border-emerald-100 dark:border-emerald-950/50';
      case 'loading':
        return 'bg-amber-500 text-amber-500 border-amber-100 dark:border-amber-950/50';
      case 'error':
        return 'bg-rose-500 text-rose-500 border-rose-100 dark:border-rose-950/50';
      default:
        return 'bg-slate-400 text-slate-400 border-slate-100 dark:border-slate-800';
    }
  };

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="bg-emerald-50 p-2 rounded-xl text-emerald-600">
          <FileSpreadsheet className="w-5 height-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">Google Sheets Integration</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
              syncStatus.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
              syncStatus.type === 'loading' ? 'bg-amber-50 border-amber-100 text-amber-700 animate-pulse' :
              syncStatus.type === 'error' ? 'bg-rose-50 border-rose-100 text-rose-700' :
              'bg-slate-50 border-slate-100 text-slate-600'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor().split(' ')[0]} mr-1.5`}></span>
              {syncStatus.type === 'success' ? 'Connected' :
               syncStatus.type === 'loading' ? 'Syncing...' :
               syncStatus.type === 'error' ? 'Sync Error' : 'Offline'}
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-0.5">{syncStatus.text}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end md:self-auto">
        {token ? (
          <>
            <button
              onClick={() => setShowImport(true)}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm rounded-xl inline-flex items-center gap-1.5 shadow-sm shadow-sky-100 transition cursor-pointer"
              id="btn-import-sheet"
              type="button"
            >
              <Download className="w-4 h-4" />
              Import Sheet
            </button>
            <button
              onClick={() => triggerSync()}
              disabled={syncStatus.type === 'loading'}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-medium text-sm rounded-xl inline-flex items-center gap-1.5 shadow-sm shadow-emerald-100 transition cursor-pointer"
              id="btn-trigger-sync"
            >
              <RefreshCw className={`w-4 h-4 ${syncStatus.type === 'loading' ? 'animate-spin' : ''}`} />
              Sync Now
            </button>
            <button
              onClick={handleSignOut}
              className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-sm rounded-xl inline-flex items-center gap-1.5 transition cursor-pointer"
              id="btn-google-signout"
            >
              <LogOut className="w-4 h-4 text-slate-500" />
              Sign Out
            </button>
          </>
        ) : (
          <button
            onClick={handleSignIn}
            disabled={syncStatus.type === 'loading'}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm rounded-xl inline-flex items-center gap-2 transition shadow-sm cursor-pointer"
            id="btn-google-signin"
          >
            <LogIn className="w-4 h-4" />
            Connect Google Sheets
          </button>
        )}
      </div>

      {showImport && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              <Download className="text-sky-600 w-5 h-5" />
              Import Sessions from Google Sheet
            </h3>
            <p className="text-slate-500 text-xs mt-1 leading-relaxed">
              Import historical badminton sessions directly into your local database. Duplicate sessions for the target quarter will be overwritten with the imported ones.
            </p>
            <form onSubmit={handleImport} className="mt-4 space-y-3">
              <div>
                <label className="block text-slate-700 text-xs font-semibold mb-1">target quarter to which data should be imported to</label>
                <select
                  value={importQuarterId}
                  onChange={(e) => setImportQuarterId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition"
                >
                  <option value="" disabled>Select a Quarter</option>
                  {quarters.map((q) => (
                    <option key={q.id} value={q.id}>{q.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-700 text-xs font-semibold mb-1">Spreadsheet ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={importSpreadsheetId}
                    onChange={(e) => setImportSpreadsheetId(e.target.value)}
                    placeholder="e.g. 1ATIG4ral9eez71KpWrfTnJd5Ja67..."
                    required
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => openDriveBrowser((id) => setImportSpreadsheetId(id))}
                    disabled={driveLoading}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition shrink-0 border border-slate-200"
                    title="Browse Google Drive"
                  >
                    <FolderOpen className="w-4 h-4 text-slate-500" />
                    Browse
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-slate-700 text-xs font-semibold mb-1">Sheet Tab Name</label>
                <input
                  type="text"
                  value={importSheetName}
                  onChange={(e) => setImportSheetName(e.target.value)}
                  placeholder="e.g. Apr-June-2026"
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition"
                />
              </div>

              {importStatus.text && (
                <div className={`p-3 rounded-xl text-xs font-semibold border ${
                  importStatus.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                  importStatus.type === 'loading' ? 'bg-amber-50 border-amber-100 text-amber-700 animate-pulse' :
                  'bg-rose-50 border-rose-100 text-rose-700'
                }`}>
                  {importStatus.text}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowImport(false);
                    setImportStatus({ text: '', type: 'idle' });
                  }}
                  disabled={importStatus.type === 'loading'}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-50 text-sm font-semibold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importStatus.type === 'loading'}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 text-white text-sm font-semibold rounded-xl shadow-sm transition inline-flex items-center gap-1"
                >
                  {importStatus.type === 'loading' ? 'Importing...' : 'Fetch & Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Google Drive File Explorer Modal */}
      {showDriveModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 flex flex-col max-h-[80vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FolderOpen className="text-emerald-600 w-5 h-5" />
                <h3 className="font-bold text-slate-800 text-base">
                  Select Spreadsheet
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDriveModal(false)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-2 shrink-0 bg-slate-50">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search spreadsheets..."
                value={driveSearch}
                onChange={(e) => setDriveSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
              />
              {driveSearch && (
                <button
                  type="button"
                  onClick={() => setDriveSearch('')}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-600"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Content list */}
            <div className="flex-1 overflow-y-auto p-4 min-h-[250px] bg-white">
              {driveLoading ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-slate-500">
                  <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 mb-2" />
                  <span className="text-xs font-semibold">Scanning Google Drive...</span>
                </div>
              ) : driveError ? (
                <div className="flex flex-col items-center justify-center h-full py-8 text-center px-4">
                  <div className="bg-rose-50 p-2.5 rounded-full text-rose-500 mb-2">
                    <X className="w-5 h-5" />
                  </div>
                  <h4 className="font-semibold text-slate-800 text-sm">Failed to Load Files</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-[240px] leading-relaxed">{driveError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      if (onSelectCallback) openDriveBrowser(onSelectCallback);
                    }}
                    className="mt-4 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-850 text-white font-semibold text-xs rounded-xl transition"
                  >
                    Retry Connection
                  </button>
                </div>
              ) : driveFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center px-4 text-slate-500">
                  <FileSpreadsheet className="w-10 h-10 text-slate-300 mb-2.5" />
                  <h4 className="font-semibold text-slate-700 text-sm">No Spreadsheets Found</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-[240px] leading-relaxed">
                    We couldn't find any Google Sheets spreadsheets in your Google Drive folder.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {driveFiles.filter(file => file.name.toLowerCase().includes(driveSearch.toLowerCase())).length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs">
                      No spreadsheets match "{driveSearch}"
                    </div>
                  ) : (
                    driveFiles
                      .filter(file => file.name.toLowerCase().includes(driveSearch.toLowerCase()))
                      .map((file) => (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() => {
                            if (onSelectCallback) {
                              onSelectCallback(file.id, file.name);
                            }
                            setShowDriveModal(false);
                          }}
                          className="w-full text-left px-3.5 py-2.5 rounded-2xl hover:bg-slate-50 active:bg-slate-100 transition flex items-center gap-3 border border-transparent hover:border-slate-100 group"
                        >
                          <div className="bg-emerald-50 text-emerald-600 p-2 rounded-xl group-hover:scale-105 transition-transform duration-200 shrink-0">
                            <FileSpreadsheet className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-800 text-xs truncate group-hover:text-emerald-600 transition-colors">
                              {file.name}
                            </div>
                            {file.modifiedTime && (
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Modified: {new Date(file.modifiedTime).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </div>
                            )}
                          </div>
                        </button>
                      ))
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
              <span className="text-[11px] text-slate-400 font-medium">
                {driveFiles.length} spreadsheet{driveFiles.length !== 1 && 's'} listed
              </span>
              <button
                type="button"
                onClick={() => setShowDriveModal(false)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition border border-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
