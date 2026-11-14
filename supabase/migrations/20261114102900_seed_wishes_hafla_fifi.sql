-- Seed official wishes for Hafla & Fifi
DELETE FROM wishes WHERE message ILIKE '%Rian%';

INSERT INTO wishes (guest_name, message, attendance_badge, pax, is_visible, created_at)
VALUES 
('Budi Santoso', 'Selamat Aflan & Fifi! Masih ingat dulu Aflan sering ke Drop Point J&T buat tukar receh, sampai momen sandal putus pas pagi hujan. Ternyata jodoh sejati! Sakinah mawaddah warahmah ya bro!', 'Hadir', 2, true, NOW() - INTERVAL '2 hours'),
('Siti Sarah & Suami', 'Barakallah Fifi sayang! Dari obrolan di Drop Point J&T hingga ikrar suci pelaminan bersama Mas Aflan. Semoga sakinah mawaddah warahmah selalu.', 'Hadir', 2, true, NOW() - INTERVAL '1 hour'),
('Dimas (Sahabat Semarang)', 'Masya Allah, dari jawaban manis di bianglala Semarang akhirnya sah bersanding di pelaminan. Berkah dan bahagia selalu untuk Hafla & Fifi!', 'Hadir', 1, true, NOW() - INTERVAL '30 minutes');
