-- Remove legacy Favur employee map rows (numeric portal IDs only).
-- Mirus uses person UUIDs or normalized display names — never pure digits.
DELETE FROM "FavurUserMap" WHERE "favurUserId" ~ '^[0-9]+$';

-- Remove scrape garbage: weekday / calendar headers mistaken for people.
DELETE FROM "FavurUserMap"
WHERE lower(coalesce("favurDisplayName", '')) ~ '^(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b'
   OR lower(coalesce("favurUserId", '')) ~ '^(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b'
   OR lower(coalesce("favurDisplayName", '')) ~ '\m[0-9]{1,2}\.\s*(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\M'
   OR lower(coalesce("favurUserId", '')) ~ '\m[0-9]{1,2}\.\s*(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\M';
