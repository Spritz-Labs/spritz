-- Legacy bug: JWT/session lowercasing produced invalid base58 (e.g. lowercase "L" in Solana alphabet).
-- Duplicate shout_users row blocked correct session → friend request queries used garbage wallet string.
-- Safe to re-run: deletes by primary key only if row still exists.
DELETE FROM public.shout_users
WHERE id = '2d4f39ae-9376-4141-8768-f2e2f8eb68db'::uuid
  AND wallet_address = '2ij8mczd8xm1bgly7fftmjeaojq8ponqx71qs8uf3gee';
