export async function onRequestPost(context) {
    try {
        // 1. Ekstraksi Payload dari Frontend
        const request = context.request;
        const { text } = await request.json();

        if (!text) {
            return new Response(JSON.stringify({ error: "Teks tidak boleh kosong" }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // 2. Akses API Key secara aman dari Environment Variables Cloudflare
        const API_KEY = context.env.GEMINI_API_KEY;
        if (!API_KEY) {
            return new Response(JSON.stringify({ error: "API Key belum dikonfigurasi di server" }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 3. ARSITEKTUR PROMPT INTI (The Secret Sauce)
        // Di sinilah manipulasi deteksi AI terjadi.
        const systemPrompt = `Anda adalah penulis manusia tingkat lanjut, editor linguistik, dan ahli SEO. Tugas Anda adalah memparafrase teks berikut agar 100% lolos dari alat deteksi AI (seperti Turnitin, GPTZero, Originality.ai).
ATURAN WAJIB (EKSEKUSI TANPA GAGAL):
1. TINGKATKAN PERPLEXITY: Gunakan kosakata yang kaya, sedikit tidak umum, namun tetap natural. Hindari frasa klise AI seperti "Kesimpulannya", "Penting untuk dicatat", "Mendalami", atau "Di era digital ini".
2. TINGKATKAN BURSTINESS: Variasikan panjang kalimat secara drastis. Campurkan kalimat sangat pendek (3-4 kata) dengan kalimat majemuk yang panjang dan kompleks. Manusia tidak menulis dengan ritme kalimat yang seragam.
3. INJEKSI KETIDAKSEMPURNAAN MANUSIAWI: Gunakan transisi antar paragraf yang sedikit asimetris. Sesekali gunakan gaya penulisan opini jika konteksnya akademik, atau gaya percakapan ringan jika non-akademik.
4. JAGA INTEGRITAS DATA: JANGAN mengubah fakta, angka, referensi, atau makna inti dari teks asli.
5. FORMAT OUTPUT: HANYA KEMBALIKAN TEKS HASIL PARAFRASE. Jangan tambahkan pembukaan seperti "Berikut adalah hasilnya" atau penutup apapun.`;

        // 4. Koneksi ke Google Gemini API (Menggunakan 1.5 Flash untuk latensi ultra-rendah dan biaya gratis yang masif)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
        
        const geminiPayload = {
            contents: [
                {
                    role: "user",
                    parts: [{ text: `${systemPrompt}\n\nTeks asli yang harus di-humanize:\n"""\n${text}\n"""` }]
                }
            ],
            generationConfig: {
                temperature: 0.85, // Suhu tinggi krusial untuk meningkatkan keacakan (perplexity) dan menurunkan skor deteksi AI
                topK: 40,
                topP: 0.95
            }
        };

        const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
        });

        const data = await response.json();

        // Validasi respons Gemini
        if (!data.candidates || data.candidates.length === 0) {
            console.error("Gemini API Error:", JSON.stringify(data));
            throw new Error("Gagal memproses teks di mesin AI.");
        }

        const humanizedText = data.candidates[0].content.parts[0].text.trim();

        // 5. Kembalikan Hasil ke Frontend
        return new Response(JSON.stringify({ result: humanizedText }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
