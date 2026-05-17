-- Rooms 18–20 are not part of the hotel layout (floor 0 is 21–37).
DELETE FROM "Room" WHERE "roomNumber" IN ('18', '19', '20');
