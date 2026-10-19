// Dompet Elsa: tampilan web. Tanpa framework; satu berkas.
const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? "http://127.0.0.1:8787/api"
  : "https://dompet-elsa.zainun.workers.dev/api";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rp = (n) => (n < 0 ? "−" : "") + "Rp" + Math.abs(n).toLocaleString("id-ID");
const tgl = (t) => (t ? new Date(t + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "Tanpa tanggal");
const hariIni = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const kelasSaldo = (n) => (n < 0 ? "minus" : "");
const NAMA_PERAN = { pimpinan: "Pimpinan", wali_l: "Wali asuh putra", wali_p: "Wali asuh putri", ortu: "Orang tua santri" };

let sesi = null;
let santri = [];
let filterJk = "semua";
let kataCari = "";
let hanyaMenipis = false;
const BATAS_MENIPIS = 20000; // saldo di bawah ini ditandai "menipis"
const menipis = (x) => x.aktif && x.saldo < BATAS_MENIPIS;
let infoList = [];
const UNTUK = { semua: "Semua wali santri", L: "Wali santri putra", P: "Wali santri putri" };
const umurHari = (i) => (Date.now() - Date.parse(String(i.dibuat).replace(" ", "T") + "Z")) / 86400000;
// Info tampil di depan sampai tanggalnya lewat; info tanpa tanggal tampil 30 hari.
const infoAktif = (i) => (i.tanggal ? i.tanggal >= hariIni() : umurHari(i) < 30);

function simpan(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
function baca(k) { try { return localStorage.getItem(k); } catch { return null; } }

async function api(path, opt = {}) {
  const res = await fetch(API + path, {
    ...opt,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + (sesi?.token || ""), ...(opt.headers || {}) },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  if (res.status === 401 && path !== "/login") { keluar(); throw new Error("Sesi berakhir, silakan masuk lagi"); }
  const ct = res.headers.get("Content-Type") || "";
  const data = ct.includes("json") ? await res.json() : await res.blob();
  if (!res.ok) throw new Error(data.error || "Gagal memuat");
  return data;
}

function toast(pesan) {
  const t = $("#toast");
  t.textContent = pesan;
  t.classList.add("tampil");
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove("tampil"), 2600);
}

const bisaUbah = () => sesi && (sesi.peran === "wali_l" || sesi.peran === "wali_p");

// ---------- masuk / keluar ----------
$("#form-masuk").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector("button");
  btn.disabled = true;
  $("#pesan-masuk").textContent = "";
  try {
    sesi = await api("/login", { method: "POST", body: { kode: $("#kode").value } });
    simpan("de_sesi", JSON.stringify(sesi));
    $("#kode").value = "";
    mulai();
  } catch (err) {
    $("#pesan-masuk").textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

function keluar() {
  sesi = null;
  simpan("de_sesi", null);
  $("#layar-app").hidden = true;
  $("#layar-masuk").hidden = false;
}
$("#btn-keluar").addEventListener("click", keluar);

function mulai() {
  $("#layar-masuk").hidden = true;
  $("#layar-app").hidden = false;
  $("#peran-label").textContent = sesi.peran === "ortu" ? `Orang tua ${sesi.nama_santri}` : NAMA_PERAN[sesi.peran];
  if (sesi.peran === "ortu") bukaSantri(sesi.santri_id);
  else beranda();
}

// ---------- beranda (pimpinan & wali) ----------
async function beranda() {
  $("#isi").innerHTML = `<p class="kosong">Memuat…</p>`;
  try {
    [santri, infoList] = await Promise.all([api("/santri"), api("/info").catch(() => [])]);
  } catch (err) {
    $("#isi").innerHTML = `<p class="kosong">${esc(err.message)}</p>`;
    return;
  }
  const wali = bisaUbah();
  $("#isi").innerHTML = `
    <section class="ringkas" id="ringkas"></section>
    <section class="info-blok" id="info"></section>
    <div class="alat">
      ${sesi.peran === "pimpinan" ? `<div class="segmen" role="group" aria-label="Saring">
        <button data-jk="semua">Semua</button><button data-jk="L">Putra</button><button data-jk="P">Putri</button></div>` : ""}
      <input class="cari" type="search" placeholder="Cari nama santri" aria-label="Cari nama santri" value="${esc(kataCari)}">
    </div>
    <div class="alat">
      ${wali ? `<button class="btn utama" id="btn-catat">+ Catat transaksi</button>
                <button class="btn" id="btn-massal">+ Catat banyak santri</button>
                <button class="btn" id="btn-santri">+ Santri</button>` : ""}
      <button class="btn" id="btn-menipis" aria-pressed="${hanyaMenipis}"></button>
      <button class="btn" id="btn-kode">Kode akses</button>
      <button class="btn" id="btn-unduh">Unduh CSV</button>
    </div>
    <ul class="daftar" id="daftar"></ul>`;
  document.querySelectorAll(".segmen button").forEach((b) => {
    b.setAttribute("aria-pressed", b.dataset.jk === filterJk);
    b.onclick = () => { filterJk = b.dataset.jk; beranda.gambar(); document.querySelectorAll(".segmen button").forEach((x) => x.setAttribute("aria-pressed", x === b)); };
  });
  $(".cari").oninput = (e) => { kataCari = e.target.value; beranda.gambar(); };
  if (wali) {
    $("#btn-catat").onclick = () => formTrx({});
    $("#btn-massal").onclick = formMassal;
    $("#btn-santri").onclick = formSantriBaru;
  }
  $("#btn-menipis").onclick = () => { hanyaMenipis = !hanyaMenipis; $("#btn-menipis").setAttribute("aria-pressed", hanyaMenipis); beranda.gambar(); };
  $("#btn-kode").onclick = halamanKode;
  $("#btn-unduh").onclick = unduhCsv;
  gambarInfo(true, beranda);
  beranda.gambar();
}
beranda.gambar = () => {
  const lingkup = santri.filter((s) => filterJk === "semua" || s.jk === filterJk);
  const aktif = lingkup.filter((s) => s.aktif);
  const jml = (k) => lingkup.reduce((a, s) => a + s[k], 0);
  const saldo = jml("saldo");
  $("#ringkas").innerHTML = `
    <div class="stat sorot"><span>Total saldo</span><strong class="angka">${rp(saldo)}</strong></div>
    <div class="stat"><span>Dana masuk</span><strong class="angka">${rp(jml("masuk"))}</strong></div>
    <div class="stat"><span>Dana keluar</span><strong class="angka">${rp(jml("keluar"))}</strong></div>
    <div class="stat"><span>Santri aktif</span><strong class="angka">${aktif.length}</strong></div>`;
  const q = kataCari.trim().toLowerCase();
  const nTipis = lingkup.filter(menipis).length;
  $("#btn-menipis").textContent = `Saldo menipis (${nTipis})`;
  const tampil = lingkup.filter((s) => (!q || s.nama.toLowerCase().includes(q)) && (!hanyaMenipis || menipis(s)));
  $("#daftar").innerHTML = tampil.length
    ? tampil.map((s) => `
      <li class="${s.aktif ? "" : "nonaktif"}"><button data-id="${s.id}">
        <span class="inisial ${s.jk}">${esc(s.nama[0] || "?")}</span>
        <span class="nama"><strong>${esc(s.nama)}${s.aktif ? "" : " (nonaktif)"}</strong>
          <small>${s.jk === "L" ? "Putra" : "Putri"} · ${s.terakhir ? "terakhir " + tgl(s.terakhir) : s.jumlah + " catatan"}${menipis(s) ? ` · <b class="saldo-tipis">saldo menipis</b>` : ""}</small></span>
        <span class="saldo angka ${kelasSaldo(s.saldo)}">${rp(s.saldo)}</span>
      </button></li>`).join("")
    : `<li class="kosong">${hanyaMenipis && !q ? "Tidak ada saldo yang menipis." : santri.length ? "Tidak ada yang cocok." : "Belum ada santri. " + (bisaUbah() ? "Tambahkan lewat tombol + Santri." : "")}</li>`;
  $("#daftar").querySelectorAll("button[data-id]").forEach((b) => (b.onclick = () => bukaSantri(+b.dataset.id)));
};

// ---------- detail santri ----------
async function bukaSantri(id) {
  $("#isi").innerHTML = `<p class="kosong">Memuat…</p>`;
  let d;
  try {
    d = await api("/santri/" + id);
    if (sesi.peran === "ortu") infoList = await api("/info").catch(() => []);
  } catch (err) {
    $("#isi").innerHTML = `<p class="kosong">${esc(err.message)}</p>`;
    return;
  }
  const { santri: s, trx } = d;
  const masuk = trx.reduce((a, t) => a + t.masuk, 0), kel = trx.reduce((a, t) => a + t.keluar, 0);
  const wali = bisaUbah();
  $("#isi").innerHTML = `
    ${sesi.peran !== "ortu" ? `<button class="btn kecil kembali" id="btn-kembali">← Semua santri</button>` : ""}
    <section class="profil">
      <small>${s.jk === "L" ? "Santri putra" : "Santri putri"}${s.aktif ? "" : " · nonaktif"}</small>
      <h2>${esc(s.nama)}</h2>
      <div class="besar angka ${kelasSaldo(d.saldo)}">${rp(d.saldo)}</div>
      <div class="baris">
        <span>Dana masuk<b class="angka">${rp(masuk)}</b></span>
        <span>Dana keluar<b class="angka">${rp(kel)}</b></span>
        <span>Catatan<b class="angka">${trx.length}</b></span>
      </div>
    </section>
    ${sesi.peran === "ortu" ? `<section class="info-blok" id="info"></section>` : ""}
    ${wali ? `<div class="alat">
      <button class="btn utama" id="btn-catat">+ Catat transaksi</button>
      <button class="btn" id="btn-ubah">Ubah data santri</button></div>` : ""}
    ${sesi.peran !== "ortu" ? `<div class="alat">
      <a class="btn ${d.saldo < BATAS_MENIPIS ? "utama" : ""}" target="_blank" rel="noopener"
        href="https://wa.me/?text=${encodeURIComponent(pesanIsiUlang(s, d.saldo, trx))}">Minta isi ulang via WhatsApp</a>
      ${d.saldo < BATAS_MENIPIS ? `<span class="catatan">Saldo di bawah ${rp(BATAS_MENIPIS)}.</span>` : ""}</div>` : ""}
    <h2 class="bagian">Riwayat (terbaru di atas)</h2>
    <div class="riwayat">
      ${trx.length ? trx.slice().reverse().map((t) => `
        <article class="trx">
          <div><div class="tgl">${tgl(t.tanggal)}</div>
            <div class="ket">${esc(t.ket && t.ket !== "impor spreadsheet" ? t.ket : "Catatan ke-" + t.urut)}</div>
            ${t.oleh && t.oleh !== "impor" ? `<div class="oleh">dicatat ${esc(t.oleh)}</div>` : ""}</div>
          <div class="nilai angka">
            ${t.masuk ? `<div class="plus">+${rp(t.masuk)}</div>` : ""}
            ${t.keluar ? `<div class="minus">−${rp(t.keluar)}</div>` : ""}
          </div>
          <div class="sisa"><span>Saldo setelahnya <b class="angka ${kelasSaldo(t.saldo)}">${rp(t.saldo)}</b></span>
            ${wali ? `<span class="aksi"><button class="btn kecil" data-ubah="${t.id}">Ubah</button>
              <button class="btn kecil bahaya" data-hapus="${t.id}">Hapus</button></span>` : ""}</div>
        </article>`).join("") : `<p class="kosong">Belum ada catatan.</p>`}
    </div>`;
  if (sesi.peran !== "ortu") $("#btn-kembali").onclick = beranda;
  else gambarInfo(false);
  if (wali) {
    $("#btn-catat").onclick = () => formTrx({ santri_id: s.id }, () => bukaSantri(s.id));
    $("#btn-ubah").onclick = () => formUbahSantri(s);
    document.querySelectorAll("[data-ubah]").forEach((b) => (b.onclick = () =>
      formTrx(trx.find((t) => t.id === +b.dataset.ubah), () => bukaSantri(s.id), s)));
    document.querySelectorAll("[data-hapus]").forEach((b) => (b.onclick = async () => {
      const t = trx.find((x) => x.id === +b.dataset.hapus);
      if (!confirm(`Hapus catatan ${tgl(t.tanggal)} (masuk ${rp(t.masuk)}, keluar ${rp(t.keluar)})?`)) return;
      try { await api("/trx/" + t.id, { method: "DELETE" }); toast("Catatan dihapus"); bukaSantri(s.id); }
      catch (err) { toast(err.message); }
    }));
  }
  window.scrollTo(0, 0);
}

// ---------- dialog ----------
function dialog(html, onSubmit) {
  const dlg = $("#dialog"), f = $("#dialog-isi");
  f.innerHTML = html;
  f.onsubmit = async (e) => {
    if (e.submitter && e.submitter.value === "batal") return;
    e.preventDefault();
    const btn = f.querySelector('button[value="ok"]');
    if (btn) btn.disabled = true;
    try { if ((await onSubmit(new FormData(f))) !== false) dlg.close(); }
    catch (err) { toast(err.message); }
    finally { if (btn) btn.disabled = false; }
  };
  if (!dlg.open) dlg.showModal();
}
const angka = (v) => Math.round(Number(String(v || "0").replace(/[^\d]/g, "")) || 0);

function formTrx(t, selesai = beranda, s) {
  const baru = !t.id;
  const pilihan = baru && !t.santri_id
    ? `<div class="medan"><label for="f-santri">Santri</label><select id="f-santri" name="santri_id" required>
        <option value="">Pilih santri</option>
        ${santri.filter((x) => x.aktif).map((x) => `<option value="${x.id}">${esc(x.nama)}</option>`).join("")}</select></div>`
    : "";
  const nama = s?.nama || santri.find((x) => x.id === t.santri_id)?.nama || "";
  dialog(`
    <h3>${baru ? "Catat transaksi" : "Ubah catatan"}${nama ? " · " + esc(nama) : ""}</h3>
    ${pilihan}
    <div class="medan"><label for="f-tgl">Tanggal</label>
      <input id="f-tgl" type="date" name="tanggal" value="${t.tanggal || (baru ? hariIni() : "")}"></div>
    <div class="dua">
      <div class="medan"><label for="f-masuk">Dana masuk (Rp)</label>
        <input id="f-masuk" name="masuk" inputmode="numeric" placeholder="0" value="${t.masuk || ""}"></div>
      <div class="medan"><label for="f-keluar">Dana keluar (Rp)</label>
        <input id="f-keluar" name="keluar" inputmode="numeric" placeholder="0" value="${t.keluar || ""}"></div>
    </div>
    <div class="medan"><label for="f-ket">Keterangan (boleh kosong)</label>
      <input id="f-ket" name="ket" maxlength="120" placeholder="mis. kiriman pekan ini, jajan, beli kitab"
        value="${esc(t.ket && t.ket !== "impor spreadsheet" ? t.ket : "")}"></div>
    <div class="tombol-dialog"><button class="btn" value="batal" formnovalidate>Batal</button>
      <button class="btn utama" value="ok">Simpan</button></div>`,
    async (fd) => {
      const body = { tanggal: fd.get("tanggal") || null, masuk: angka(fd.get("masuk")), keluar: angka(fd.get("keluar")), ket: fd.get("ket") };
      if (baru) {
        body.santri_id = t.santri_id || +fd.get("santri_id");
        await api("/trx", { method: "POST", body });
      } else {
        await api("/trx/" + t.id, { method: "PUT", body });
      }
      toast("Tersimpan");
      selesai();
    });
}

// ---------- info dari pondok ----------
function pesanInfo(i) {
  return `*${i.judul}*\n` + (i.tanggal ? `Tanggal: ${tgl(i.tanggal)}\n` : "") + (i.isi ? `${i.isi}\n` : "") +
    `\n— Pondok Pesantren Anak Soleh El Salim\n${location.origin + location.pathname}`;
}
function kartuInfo(i, admin) {
  return `<article class="info-kartu">
    <div class="info-atas"><strong>${esc(i.judul)}</strong>${umurHari(i) < 7 ? `<span class="info-baru">Baru</span>` : ""}</div>
    ${i.tanggal ? `<div class="info-tgl">📅 ${tgl(i.tanggal)}</div>` : ""}
    ${i.isi ? `<p>${esc(i.isi).replace(/\n/g, "<br>")}</p>` : ""}
    ${admin ? `<div class="info-bawah"><small>${esc(UNTUK[i.untuk])} · ${esc(i.oleh || "")}</small>
      <span class="aksi"><a class="btn kecil" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(pesanInfo(i))}">Bagikan WA</a>
      ${i.boleh_ubah ? `<button class="btn kecil" data-info-ubah="${i.id}">Ubah</button>
      <button class="btn kecil bahaya" data-info-hapus="${i.id}">Hapus</button>` : ""}</span></div>` : ""}
  </article>`;
}
function gambarInfo(admin, ulang) {
  const el = $("#info"); if (!el) return;
  const aktif = infoList.filter(infoAktif), lama = infoList.filter((i) => !infoAktif(i));
  if (!admin && !aktif.length && !lama.length) { el.hidden = true; return; }
  el.innerHTML = `
    <div class="info-judul"><h2 class="bagian">Info dari pondok</h2>
      ${admin && sesi.peran !== "ortu" ? `<button class="btn kecil utama" id="btn-info-baru">+ Tulis info</button>` : ""}</div>
    ${aktif.length ? aktif.map((i) => kartuInfo(i, admin)).join("") : `<p class="catatan">Belum ada info. ${admin ? "Tulis info SPP, pengajian, atau kegiatan lewat tombol + Tulis info." : ""}</p>`}
    ${lama.length ? `<details class="info-arsip"><summary>Info lama (${lama.length})</summary>${lama.map((i) => kartuInfo(i, admin)).join("")}</details>` : ""}`;
  if (!admin) return;
  $("#btn-info-baru").onclick = () => formInfo({}, ulang);
  el.querySelectorAll("[data-info-ubah]").forEach((b) => (b.onclick = () => formInfo(infoList.find((i) => i.id === +b.dataset.infoUbah), ulang)));
  el.querySelectorAll("[data-info-hapus]").forEach((b) => (b.onclick = async () => {
    const i = infoList.find((x) => x.id === +b.dataset.infoHapus);
    if (!confirm(`Hapus info "${i.judul}"?`)) return;
    try { await api("/info/" + i.id, { method: "DELETE" }); toast("Info dihapus"); ulang(); }
    catch (err) { toast(err.message); }
  }));
}
function formInfo(i, selesai) {
  const baru = !i.id;
  const pilihan = sesi.peran === "pimpinan" ? ["semua", "L", "P"] : ["semua", sesi.jk];
  dialog(`
    <h3>${baru ? "Tulis info" : "Ubah info"}</h3>
    <div class="medan"><label for="f-judul">Judul</label>
      <input id="f-judul" name="judul" maxlength="80" required placeholder="mis. Pembayaran SPP November" value="${esc(i.judul || "")}"></div>
    <div class="medan"><label for="f-isi">Isi (boleh kosong)</label>
      <textarea id="f-isi" name="isi" maxlength="600" rows="4" placeholder="mis. SPP bulan November dibayar paling lambat tanggal 10 di kantor pondok.">${esc(i.isi || "")}</textarea></div>
    <div class="dua">
      <div class="medan"><label for="f-tgl">Tanggal acara / batas (boleh kosong)</label>
        <input id="f-tgl" type="date" name="tanggal" value="${i.tanggal || ""}"></div>
      <div class="medan"><label for="f-untuk">Untuk</label><select id="f-untuk" name="untuk">
        ${pilihan.map((u) => `<option value="${u}" ${(i.untuk || "semua") === u ? "selected" : ""}>${UNTUK[u]}</option>`).join("")}</select></div>
    </div>
    <p class="catatan">Info dengan tanggal tampil sampai tanggalnya lewat. Info tanpa tanggal tampil 30 hari, lalu pindah ke "Info lama".</p>
    <div class="tombol-dialog"><button class="btn" value="batal" formnovalidate>Batal</button>
      <button class="btn utama" value="ok">Simpan</button></div>`,
    async (fd) => {
      const body = { judul: fd.get("judul"), isi: fd.get("isi"), tanggal: fd.get("tanggal") || null, untuk: fd.get("untuk") };
      if (baru) await api("/info", { method: "POST", body }); else await api("/info/" + i.id, { method: "PUT", body });
      toast("Info tersimpan");
      selesai();
    });
}

// Pesan WhatsApp tanpa nomor: wali memilih sendiri kontak orang tua di HP-nya.
function pesanIsiUlang(s, saldo, trx) {
  const akhir = trx.slice(-3).reverse().map((t) =>
    `- ${tgl(t.tanggal)}: ${t.ket && t.ket !== "impor spreadsheet" ? t.ket + " " : ""}${t.masuk ? "+" + rp(t.masuk) : ""}${t.masuk && t.keluar ? " / " : ""}${t.keluar ? "−" + rp(t.keluar) : ""}`);
  return `Assalamu'alaikum, Bapak/Ibu orang tua ${s.nama}.\n` +
    `Saldo uang saku ${s.nama} di Pondok Pesantren Anak Soleh El Salim saat ini ${rp(saldo)}.\n` +
    (akhir.length ? `Catatan terakhir:\n${akhir.join("\n")}\n` : "") +
    `Mohon berkenan mengirim uang saku berikutnya. Riwayat lengkap bisa dilihat di ${location.origin + location.pathname} dengan kode akses orang tua.\n` +
    `Jazakumullah khairan.`;
}

// Satu catatan yang sama untuk banyak santri (mis. jajan pekanan).
function formMassal() {
  const aktif = santri.filter((x) => x.aktif);
  if (!aktif.length) { toast("Belum ada santri aktif"); return; }
  dialog(`
    <h3>Catat untuk banyak santri</h3>
    <div class="medan"><label class="semua"><input type="checkbox" id="f-semua"> Pilih semua (${aktif.length} santri)</label>
      <div class="pilih-santri">${aktif.map((x) => `<label><input type="checkbox" name="sid" value="${x.id}">
        <span>${esc(x.nama)}</span><small class="angka">${rp(x.saldo)}</small></label>`).join("")}</div></div>
    <div class="medan"><label for="f-tgl">Tanggal</label><input id="f-tgl" type="date" name="tanggal" value="${hariIni()}"></div>
    <div class="dua">
      <div class="medan"><label for="f-masuk">Dana masuk (Rp)</label><input id="f-masuk" name="masuk" inputmode="numeric" placeholder="0"></div>
      <div class="medan"><label for="f-keluar">Dana keluar (Rp)</label><input id="f-keluar" name="keluar" inputmode="numeric" placeholder="0"></div>
    </div>
    <div class="medan"><label for="f-ket">Keterangan (boleh kosong)</label>
      <input id="f-ket" name="ket" maxlength="120" placeholder="mis. jajan pekan ini"></div>
    <p class="catatan" id="f-status">Nominal yang sama dicatat untuk setiap santri yang dipilih.</p>
    <div class="tombol-dialog"><button class="btn" value="batal" formnovalidate>Batal</button>
      <button class="btn utama" value="ok">Simpan</button></div>`,
    async (fd) => {
      const ids = fd.getAll("sid").map(Number);
      const body = { tanggal: fd.get("tanggal") || null, masuk: angka(fd.get("masuk")), keluar: angka(fd.get("keluar")), ket: fd.get("ket") };
      if (!ids.length) throw new Error("Pilih minimal satu santri");
      if (!body.masuk && !body.keluar) throw new Error("Isi dana masuk atau dana keluar");
      const gagal = [];
      for (let i = 0; i < ids.length; i++) {
        $("#f-status").textContent = `Menyimpan ${i + 1} dari ${ids.length}…`;
        try { await api("/trx", { method: "POST", body: { ...body, santri_id: ids[i] } }); }
        catch { gagal.push(ids[i]); }
      }
      if (gagal.length) {
        const nama = gagal.map((id) => santri.find((x) => x.id === id)?.nama || "#" + id);
        $("#f-status").textContent = `Belum tersimpan untuk: ${nama.join(", ")}. Yang lain sudah masuk. Tekan Simpan lagi untuk nama ini saja.`;
        document.querySelectorAll('[name="sid"]').forEach((c) => { c.checked = gagal.includes(+c.value); });
        return false;
      }
      toast(`Tersimpan untuk ${ids.length} santri`);
      beranda();
    });
  $("#f-semua").onchange = (e) => document.querySelectorAll('[name="sid"]').forEach((c) => (c.checked = e.target.checked));
}

function formSantriBaru() {
  dialog(`
    <h3>Tambah santri ${sesi.jk === "L" ? "putra" : "putri"}</h3>
    <div class="medan"><label for="f-nama">Nama santri</label><input id="f-nama" name="nama" maxlength="60" required></div>
    <div class="tombol-dialog"><button class="btn" value="batal" formnovalidate>Batal</button>
      <button class="btn utama" value="ok">Tambah</button></div>`,
    async (fd) => {
      const nama = fd.get("nama").trim();
      const r = await api("/santri", { method: "POST", body: { nama } });
      tampilKode(`Orang tua ${nama}`, r.kode_ortu);
      beranda();
      return false;
    });
}

function formUbahSantri(s) {
  dialog(`
    <h3>Ubah data santri</h3>
    <div class="medan"><label for="f-nama">Nama santri</label><input id="f-nama" name="nama" maxlength="60" required value="${esc(s.nama)}"></div>
    <div class="medan"><label for="f-aktif">Status</label><select id="f-aktif" name="aktif">
      <option value="1" ${s.aktif ? "selected" : ""}>Aktif</option>
      <option value="0" ${s.aktif ? "" : "selected"}>Nonaktif (sudah keluar / lulus)</option></select></div>
    <div class="tombol-dialog"><button class="btn" value="batal" formnovalidate>Batal</button>
      <button class="btn utama" value="ok">Simpan</button></div>`,
    async (fd) => {
      await api("/santri/" + s.id, { method: "PUT", body: { nama: fd.get("nama"), aktif: fd.get("aktif") === "1" } });
      toast("Tersimpan");
      bukaSantri(s.id);
    });
}

function tampilKode(label, kode) {
  const teks = `Assalamu'alaikum. Kode akses Dompet Elsa untuk ${label}: ${kode}\nBuka ${location.origin + location.pathname} lalu masukkan kode tersebut.`;
  dialog(`
    <h3>Kode akses baru</h3>
    <p>${esc(label)}</p>
    <div class="kode-baru angka">${esc(kode)}</div>
    <p class="catatan">Kode ini hanya tampil sekali. Kode lama otomatis tidak berlaku.</p>
    <div class="tombol-dialog">
      <a class="btn" href="https://wa.me/?text=${encodeURIComponent(teks)}" target="_blank" rel="noopener">Kirim via WhatsApp</a>
      <button class="btn" type="button" id="btn-salin">Salin</button>
      <button class="btn utama" value="batal">Selesai</button></div>`, () => {});
  $("#btn-salin").onclick = () => navigator.clipboard.writeText(teks).then(() => toast("Disalin"), () => toast("Gagal menyalin"));
}

// ---------- kode akses ----------
async function halamanKode() {
  let akun;
  try { akun = await api("/akun"); } catch (err) { toast(err.message); return; }
  $("#isi").innerHTML = `
    <button class="btn kecil kembali" id="btn-kembali">← Semua santri</button>
    <h2 class="bagian">Kode akses</h2>
    <p class="catatan">Kode tidak disimpan dalam bentuk asli, jadi tidak bisa dilihat ulang. Tekan "Buat kode baru" bila ada yang lupa; kode lama langsung tidak berlaku.</p>
    <ul class="daftar">${akun.map((a) => `
      <li class="akun-baris"><span>${esc(a.label)}<br><small class="catatan">${NAMA_PERAN[a.peran]}</small></span>
        <button class="btn kecil" data-akun="${a.id}">Buat kode baru</button></li>`).join("") || `<li class="kosong">Tidak ada akun.</li>`}</ul>`;
  $("#btn-kembali").onclick = beranda;
  document.querySelectorAll("[data-akun]").forEach((b) => (b.onclick = async () => {
    const a = akun.find((x) => x.id === +b.dataset.akun);
    if (!confirm(`Buat kode baru untuk ${a.label}? Kode lama tidak berlaku lagi.`)) return;
    try { const r = await api(`/akun/${a.id}/kode`, { method: "POST" }); tampilKode(r.label, r.kode); }
    catch (err) { toast(err.message); }
  }));
}

async function unduhCsv() {
  try {
    const blob = await api("/export");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dompet-elsa-${hariIni()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (err) { toast(err.message); }
}

// ---------- awal ----------
try { sesi = JSON.parse(baca("de_sesi")); } catch { sesi = null; }
if (sesi?.token) mulai(); else keluar();
