// Demo identity. Until real auth exists, the app acts as the seeded demo user
// (Elisa Tron) — id matches app/supabase/seed.sql.
export const DEMO_USER_ID = "10000000-0000-0000-0000-000000000001";
export const DEMO_USER = { fullName: "Elisa Tron", initials: "ET" };

// Owner access codes bypass the portfolio access-agreement (NDA) modal entirely
// and go straight to the study selector — no agreement recorded.
export const OWNER_CODES = ["ARKEN-ADMIN"];
