export interface Player {
  id: number;
  name: string;
  tier: string;
  groups: string[];
  isActive: boolean;
  family: string;
  category?: 'Adult' | 'Kid';
}

export interface Quarter {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
}

export interface Session {
  id: number;
  quarterId: number;
  date: string;
  courtFee: number;
  attendeeIds: number[];
  paidById: number;
  shares: number[]; // Not used heavily on client, but keeps DB compatibility
  expenseType: string;
  comment: string;
}

export interface FirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId?: string;
  oAuthClientId?: string;
}
