#!/usr/bin/env node
/** Static verification for the OHLI Social Android source. No server/account required. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let passed = 0;
function check(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
  console.log(`PASS ${passed}: ${message}`);
}
function checkCssBraces(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  let quote = null, escaped = false;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{') stack.push(i);
    else if (ch === '}') {
      if (!stack.length) return false;
      stack.pop();
    }
  }
  return stack.length === 0 && quote === null;
}

const js = read('app/src/main/assets/ohli-social.js');
new vm.Script(js, {filename: 'ohli-social.js'});
check(true, 'JavaScript OHLI Social dapat diparse');

const html = read('app/src/main/assets/index.html');
const inlineStyles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map((m) => m[1]);
check(inlineStyles.length > 0 && inlineStyles.every(checkCssBraces), `${inlineStyles.length} blok CSS inline HTML seimbang`);
const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map((m) => m[1]).filter((s) => s.trim());
for (let i = 0; i < inlineScripts.length; i += 1) new vm.Script(inlineScripts[i], {filename: `index-inline-${i + 1}.js`});
check(inlineScripts.length > 0, `${inlineScripts.length} skrip inline HTML dapat diparse`);
check(checkCssBraces(read('app/src/main/assets/ohli-social.css')), 'Kurung blok CSS Social seimbang');

const java = read('app/src/main/java/com/rk/server/ServerService.java');
for (const [needle, message] of [
  ['/api/activity/history', 'endpoint riwayat server tersedia'],
  ['/api/social/users', 'endpoint penemuan akun Social terpisah dari Chat tersedia'],
  ['private void getChatUsers', 'endpoint daftar Chat memakai serializer nomor privat'],
  ['private void getSocialUsers', 'endpoint daftar Social memakai ID publik'],
  ['boolean allowed=u!=null', 'pencarian nomor menggunakan hasil izin akses'],
  ['&&canDirectMessage(me.optString("phone"),phone)', 'pencarian nomor tidak mengungkap akun yang melarang DM'],
  ['ohli-activity-history.json', 'riwayat memiliki penyimpanan server'],
  ['/api/status/collections', 'endpoint koleksi Story tersedia'],
  ['/api/status/delete', 'penghapusan Story milik sendiri tersedia'],
  ['/api/groups/delete', 'penghapusan grup oleh pemilik tersedia'],
  ['/api/channels/delete', 'penghapusan Channel oleh pemilik tersedia'],
  ['ohli-story-collections.json', 'pin/arsip Story memiliki penyimpanan server'],
  ['/api/messages/once/open', 'endpoint klaim teks sekali lihat tersedia'],
  ['viewOnceSessionKey', 'media 1× memiliki kunci sesi server'],
  ['if(!onceSessionKey.matches("[a-fA-F0-9]{32}"))', 'media 1× menolak permintaan tanpa kunci sesi'],
  ['safe.put("text","")', 'isi teks 1× disamarkan dari daftar chat penerima'],
  ['r.put("phone",id)', 'API Social mengganti nomor dengan ID publik stabil'],
  ['/api/groups/vote', 'endpoint pemungutan suara grup tersedia'],
  ['/api/channels/react', 'endpoint reaksi Channel tersedia'],
  ['canDirectMessage(sender,recipient)', 'aturan DM diperiksa di server saat pengiriman'],
]) {
  if (!message) continue;
  check(java.includes(needle), message);
}
const postSerializer = java.slice(java.indexOf('private JSONObject publicPost'), java.indexOf('private double socialPostRank'));
check(postSerializer.includes('p.put("author",authorUser==null?"":socialId(authorUser))'), 'nomor penulis postingan tidak bocor bahkan kepada pemiliknya');
check(postSerializer.includes('sc.put("phone",cu==null?"":socialId(cu))') && postSerializer.includes('sl.put("phone",lu==null?"":socialId(lu))') && postSerializer.includes('sr.put("phone",ru==null?"":socialId(ru))'), 'nomor pemberi komentar, like, dan repost disamarkan');
check(java.includes('row.put("repostedBy",repostUser==null?"":socialId(repostUser))'), 'penanda repost tidak mengembalikan nomor akun sendiri');
check(java.includes('safeComment.put("phone",socialId(me))') && java.includes('p.put("authorName",socialDisplayName(authorUser))') && java.includes('socialDisplayName(JSONObject u)'), 'respons komentar dan nama penulis Social disanitasi, termasuk akun lama yang nama tampilannya berupa nomor');
check(java.includes('publicStatus.put("phone",socialId(me))') && java.includes('safeHighlight.put("owner",socialId(me))'), 'respons publik pembuatan Story dan Sorotan tidak membocorkan nomor');
const channelSerializer = java.slice(java.indexOf('private JSONObject publicChannelPost'), java.indexOf('private void getChannelPosts'));
check(channelSerializer.includes('p.put("author",author==null?"":socialId(author))') && channelSerializer.includes('sr.put("phone",ru==null?"":socialId(ru))'), 'nomor penulis dan pemberi reaksi Channel selalu disamarkan');
check(java.includes('safe.put("sender",senderUser==null?"":socialId(senderUser))') && java.includes('safe.put("name",socialDisplayName(senderUser))'), 'respons Grup menampilkan ID sosial dan nama aman');
const statusSerializer = java.slice(java.indexOf('private void getStatuses'), java.indexOf('private void getImage'));
check(statusSerializer.includes('safe.put("phone",statusOwner==null?"":socialId(statusOwner))') && statusSerializer.includes('sl.put("phone",lu==null?"":socialId(lu))'), 'nomor pemilik dan pemberi like Story Social selalu disamarkan');
const socialUi = read('app/src/main/assets/ohli-social.js');
const css = read('app/src/main/assets/ohli-social.css');
check(socialUi.includes("rt.request('/api/social/users')") && !socialUi.includes("rt.request('/api/users')"), 'UI Social tidak lagi meminta daftar nomor telepon Chat');
check(socialUi.includes('(s.isMine||s.phone===me.phone)') && socialUi.includes("var freshStories=await rt.request('/api/status?surface=social')"), 'UI Story mengenali Story sendiri tanpa mengandalkan nomor telepon');
check(socialUi.includes('isMine:items.some(function(s){return s.isMine===true;})') && socialUi.includes('isMine=!!p.isMine') && socialUi.includes('canManage=!!c.isMine||!!p.isMine'), 'UI feed, Story, dan komentar memakai penanda isMine saat nomor disamarkan');
const onceOpen = java.slice(java.indexOf('private void openViewOnceMessage'), java.indexOf('private void markMessagesRead'));
check(onceOpen.includes('viewOnceOpenedAt') && onceOpen.includes('410'), 'klaim kedua teks 1× ditolak server');
const media = java.slice(java.indexOf('private void getMedia'), java.indexOf('private void getImage'));
check(media.includes('viewOnceSessionKey') && media.includes('10L*60L*1000L') && media.includes('Cache-Control: no-store'), 'media 1× mendukung Range untuk sesi yang sama dan no-store');
const poll = java.slice(java.indexOf('private void voteGroupPoll'), java.indexOf('private JSONObject publicChannelPost'));
check(poll.indexOf('if(!validOption)') < poll.indexOf('option.put("votes",next)'), 'poll memvalidasi opsi sebelum mengubah suara');
const channelReact = java.slice(java.indexOf('private void toggleChannelReaction'), java.indexOf('private void createChannelPost'));
check(channelReact.includes('!\"public\".equals(channel.optString(\"privacy\"') && channelReact.includes('followers'), 'reaksi Channel memeriksa akses Channel privat');

const finalChatCss = html.slice(html.indexOf('id=\"ohli-v330-unified-instagram-ui\"'));
check(finalChatCss.includes('SF Pro Text') && finalChatCss.includes('#fafafa') && finalChatCss.includes('#0095f6'), 'tema terang minimalis dan font sistem Apple berlaku sebagai override paling akhir');
check(finalChatCss.includes('body .auth-screen{background:#fafafa!important}') && finalChatCss.includes('body .call-overlay{background:#fafafa!important'), 'halaman login dan panggilan mengikuti tema netral yang sama');
check(finalChatCss.includes('#app .my-profile{display:flex!important') && finalChatCss.includes('#ohliSocialShell .ohli-sidebar{background:#fff!important'), 'profil diri Chat dan navigasi Social tidak disembunyikan tema lama');
check(java.includes('r.put("name",socialDisplayName(u))') && socialUi.includes("topName=String(me.name||'').trim()"), 'nama akun lama yang sama dengan nomor tidak tampil sebagai identitas Social');
check(socialUi.includes('async function loadGroupInviteOptions') && socialUi.includes("rt.request('/api/contacts')") && socialUi.includes("rt.request('/api/social/users')"), 'pemilih grup menggabungkan kontak Chat dan koneksi Social');
check(socialUi.includes("digits===String(c.phone||'').replace(/\\D/g,'')") && socialUi.includes("name=c.username?'@'+c.username:'Pengguna OHLI'"), 'pemilih teman Social tidak menampilkan nomor ketika nama akun lama sama dengan nomor');
check(java.includes('row.put(\"followsYou\",isFollowing(target,viewer))') && java.includes('canInviteToGroup(owner,target)'), 'backend mengizinkan undangan kontak atau koneksi Social yang berelasi');
check(socialUi.includes('async function showCommunityForm') && socialUi.includes('name=\"memberPhones\"'), 'formulir buat grup mengirim teman pilihan sebagai ID sosial');
check(socialUi.includes('async function showGroupMemberPicker') && socialUi.includes('loadGroupInviteOptions()') && socialUi.includes("'/api/groups/members'"), 'pemilik grup dapat menambah kontak atau koneksi Social setelah grup dibuat');
check(socialUi.includes('data-action=\"group-members\"') && socialUi.includes('data-action=\"group-add-members\"'), 'ruang grup menampilkan aksi anggota dan tambah teman');
check(html.includes('id=\"myProfileButton\"') && html.includes('async function openMyChatProfile') && html.includes('/api/me'), 'profil diri Chat memuat nomor pribadi dari endpoint akun terautentikasi');
check(html.includes('id=\"editUsername\"') && html.includes('username:username'), 'username Social bisa diedit dari profil akun Chat');
check(!socialUi.includes('toggle-liquid-glass": [') && !socialUi.includes('Warna aksen utama<input name=\"accent\" type=\"color\"'), 'kontrol warna yang tidak selaras dihapus dari pengaturan Social');
const gradle = read('app/build.gradle');
check(gradle.includes("versionCode 33") && gradle.includes('versionName "3.6.4"'), 'identitas build Android sesuai v3.6.4');
const smoke = read('tools/smoke-test.mjs');
for (const [needle, message] of [
  ["'/api/social/users'", 'tes integrasi memeriksa direktori Social tanpa nomor'],
  ["'/api/activity/history'", 'tes integrasi memeriksa riwayat lintas sesi'],
  ["'/api/status/collections'", 'tes integrasi memeriksa pin dan arsip Story'],
  ["'/api/messages/once/open'", 'tes integrasi memeriksa klaim View Once dari sesi kedua'],
  ["'/api/groups/members'", 'tes integrasi memeriksa tambah dan keluarkan anggota grup'],
  ["'/api/me'", 'tes integrasi memeriksa data profil pribadi Chat'],
  ["'/api/groups/vote'", 'tes integrasi memeriksa polling grup'],
  ["'/api/channels/react'", 'tes integrasi memeriksa reaksi Channel'],
  ["'/api/groups/delete'", 'tes integrasi membersihkan grup uji'],
  ["'/api/channels/delete'", 'tes integrasi membersihkan Channel uji'],
]) check(smoke.includes(needle), message);
const workflow = read('.github/workflows/build-apk.yml');
check(workflow.includes('OHLI-Social-Source-v3.6.4.zip') && workflow.indexOf('OHLI-Social-Source-v3.6.4.zip') < workflow.indexOf('OHLI-Social-Source-v3.6.2.zip'), 'workflow GitHub Actions memprioritaskan arsip v3.6.4');
check(html.includes("window.ohliRuntime.request('/api/chat/resolve?target='"), 'resolver Chat dari profil menyertakan token melalui runtime bridge autentikasi');
check(socialUi.includes('data-social-id=') && socialUi.includes('var socialId=button.dataset.socialId||button.dataset.phone'), 'tombol Chat menggunakan Social ID dari profil yang sedang aktif');
check(socialUi.includes('chatOpenRequest') && socialUi.includes('requestId!==chatOpenRequest'), 'request resolve lama tidak dapat menimpa target Chat yang lebih baru');
check(html.includes('openChatWith:async function(phone)') && html.includes('await refreshMessages(false)'), 'Chat memvalidasi target, membuka peer spesifik, lalu menyegarkan riwayat server');
check(socialUi.includes('function readCustomThemeColors()') && socialUi.includes('ohli:social-custom-colors'), 'preferensi warna ikon dan tulisan disimpan lokal');
check(socialUi.includes('data-action=\"theme-custom-save\"') && socialUi.includes('data-action=\"theme-custom-reset\"'), 'UI simpan dan reset warna tema tersedia');
check(html.includes('ohli-v363-focused-fixes') && html.includes('.ohli-nav-link[data-page=\"create\"] svg') && html.includes('.ohli-reel-notifications svg'), 'ikon plus dan lonceng video pendek diatur putih');
check(html.includes('.rkm-live-modal.is-host:not(.is-live) .rkm-live-menu>summary') && html.includes('.rkm-live-menu[open]>.rkm-live-sheet-panel'), 'menu tiga titik LIVE tersedia sejak tahap persiapan dan sheet dikendalikan buka/tutup');
check(html.includes('id=\"rkmLiveTitle\"') && html.includes('id=\"rkmLiveStartBtn\"') && html.includes('id=\"rkmLiveEnd\"'), 'pengaturan judul, Mulai LIVE, dan Akhiri LIVE tetap tersedia');

check(socialUi.includes('var pendingStickerImport = null') && socialUi.includes('async function previewImportedSticker') && socialUi.includes('async function saveImportedSticker') && socialUi.includes('rt.uploadCommentSticker(pending.file)'), 'impor stiker memiliki pratinjau dan upload server setelah konfirmasi');
check(socialUi.includes("rt.request('/api/stickers')") && socialUi.includes("rt.request('/api/stickers/delete'"), 'koleksi Stiker Saya dibaca dari server dan penghapusan memakai pemeriksaan pemilik');
check(java.includes('private void getStickerLibrary') && java.includes('private void deleteOwnSticker') && java.includes('GET".equals(method) && "/api/stickers".equals(path)'), 'backend menyediakan daftar dan hapus stiker milik akun');
check(java.includes('private void getMyMusic') && java.includes('durationSeconds') && java.includes('Audio maksimal 30 MB per file'), 'Audio Saya tersimpan server dengan durasi dan batas ukuran upload');
check(java.includes('r.put("version", "3.6.4")'), 'endpoint health menampilkan versi source v3.6.4');
check(smoke.includes('uploadBinary') && smoke.includes('/api/stickers/delete') && smoke.includes('/api/music/delete') && smoke.includes('makeSilentWav'), 'smoke test dua akun memiliki skenario upload/persistensi/hapus stiker dan audio biner');
check(socialUi.includes("rt.request('/api/music/mine')") && socialUi.includes('Audio Saya') && socialUi.includes('readAudioDuration(musicFile)'), 'Audio Saya dapat dimuat ulang dan menampilkan durasi file impor');
check(socialUi.includes("shell.classList.toggle('ohli-reels-nav-transparent'") && socialUi.includes("shell.classList.toggle('ohli-reels-nav-black'") && socialUi.includes("localStorage.setItem('ohli:social-reel-nav-bg'"), 'latar navigasi video Hitam/Transparan tersimpan tanpa menyembunyikan ikon');
check(socialUi.includes("'orange'") && socialUi.includes('data-theme="orange"') && html.includes("document.body.classList.toggle('v5-orange',orange)"), 'Tema Orange menjadi opsi tersimpan di Chat dan Social');
check(css.includes('.ohli-sticker-preview') && css.includes('.ohli-reels-nav-transparent') && css.includes('.ohli-reels-nav-black') && css.includes('.ohli-orange'), 'CSS tambahan hanya menargetkan pratinjau stiker, latar nav video, dan aksen Orange');
check(socialUi.includes('async function downloadVideoWithWatermark') && socialUi.includes("'OHLI'") && socialUi.includes('allowDownload===false'), 'unduhan membuat salinan video ber-watermark OHLI dan memeriksa izin pemilik');
check(java.includes('"1".equals(queryParam(query,"download")) && !post.optBoolean("allowDownload",true)'), 'server tetap menolak unduhan bila pemilik menonaktifkannya');
check(socialUi.includes('profileVideoLayout') && socialUi.includes('data-action="profile-media-mode"') && socialUi.includes('is-transparent') && socialUi.includes('is-limited'), 'profil menyediakan mode video Transparan dan Terbatas');
check(socialUi.includes('data-action="reply-comment"') && socialUi.includes('data-action="like-comment"') && socialUi.includes("'/api/posts/comments/like'"), 'komentar mendukung balasan bertingkat dan like server-side');
check(socialUi.includes("'/api/stickers/favorites'") && socialUi.includes('data-comment-sticker-file') && java.includes('private void toggleStickerFavorite'), 'stiker bawaan, impor, dan koleksi favorit terhubung ke server');
check(html.includes('function liveModalHtml') && html.includes('function openRkmLivePreview') && html.includes('rkmLiveQuality') && html.includes('rkmLiveFlip') && html.includes('/api/live/comment'), 'studio LIVE mengatur kamera, mikrofon, kualitas, dan komentar realtime');
check(html.includes('new RTCPeerConnection') && html.includes('maksimal 6 penonton langsung') && html.includes('/api/live/signal'), 'LIVE memakai signaling WebRTC P2P nyata dan menjelaskan batas kapasitasnya');
check(html.includes('var wasAtBottom=(mainBody.scrollHeight-mainBody.scrollTop-mainBody.clientHeight)<110') && html.includes('shouldFollow=arr.length&&(wasAtBottom||peerChanged)'), 'Chat otomatis ke pesan terbaru tanpa melompat saat pengguna membaca pesan lama');
check(socialUi.includes('function onCommentHoldStart') && socialUi.includes('function replyToComment') && socialUi.includes('setTimeout(function(){commentHoldConsumed=true'), 'menahan komentar membuka alur Balas');
check(socialUi.includes('function onStoryHoldStart') && socialUi.includes('function pauseStoryPlayback') && socialUi.includes('function resumeStoryPlayback'), 'Story dijeda saat ditahan dan dilanjutkan dari posisi saat dilepas');
check(html.includes('function mediaTarget') && html.includes("e.target.closest('#ohliSocialShell .ohli-comment')") && html.includes('selectstart'), 'menu Copy bawaan diblokir hanya pada video dan teks komentar Social');
check(html.includes('body.v5-dark') && html.includes('#ohliSocialShell.ohli-dark') && html.includes('setTheme:function(next)'), 'Mode Malam tersimpan dan mencakup Chat serta Social');
check(html.includes('ohli-comment-actions') && html.includes('visualViewport') && socialUi.includes('data-comment-id="\'+esc(c.id)'), 'panel komentar punya aksi berjarak, balasan tahan, dan penyesuaian keyboard HP');

check(html.includes('var once=sendOnceMode,reply=window.__reply') && html.includes('if(window.clearReply)window.clearReply()'), 'pesan yang digeser benar-benar mengirim kutipan balasan dan membersihkan bar setelah berhasil');
check(html.includes('function messageForRow(row)') && html.includes("body.addEventListener('touchcancel',finishGesture"), 'gesture swipe memetakan bubble yang benar dan membersihkan sentuhan yang dibatalkan');


check(socialUi.includes('ohli-reel-download') === false && socialUi.includes('data-action=\"share-download\"') && socialUi.includes("else if (kind === 'download')") && socialUi.includes("else if (action === 'share-download')"), 'tombol download video pendek dipindahkan ke dalam menu Bagikan dengan pemeriksaan izin');
check(socialUi.includes('ohli-ed-tools-scroll') && socialUi.includes('ohli-ed-tools'), 'toolbar editor unggahan memiliki wadah geser horizontal tanpa mengubah aksi alat');
check(css.includes('.ohli-ed-tools-scroll') && css.includes('touch-action:pan-x') && css.includes('overscroll-behavior-x:contain'), 'toolbar editor mendukung swipe HP dan tidak mengambil alih scroll vertikal');
check(css.includes('#crGo') && css.includes('grid-template-columns:minmax(0,1fr) minmax(0,1fr)'), 'baris pengaturan upload responsif dan tombol Bagikan tetap terlihat di layar HP');
check(html.includes('rkm-live-modal .rkm-live-comment') && html.includes('background:#171a20!important') && html.includes('backdrop-filter:none!important'), 'panel LIVE menggunakan latar solid tanpa efek transparan');
check(html.includes('.ohli-full-reels[data-page=\"videos\"] .ohli-sidebar{background:transparent!important') && html.includes('text-shadow:0 1px 5px #000b'), 'navigasi bawah video pendek hanya menampilkan ikon tanpa panel latar');
check(read('app/build.gradle').includes('versionName "3.6.4"') && read('app/build.gradle').includes('versionCode 33'), 'versi Android dinaikkan ke v3.6.4');


check(html.includes('content="#000000"') && html.includes('id="ohli-v36-fullbleed-feed-live"') && html.includes('height:100dvh') && html.includes('grid-template-areas:"stage"'), 'feed video memakai viewport penuh, tema browser hitam, dan fallback viewport dinamis');
check(html.includes('id="rkmLiveMenu"') && html.includes('id="rkmLiveCameraError"') && html.includes('id="rkmLiveConfirmEnd"') && html.includes('id="rkmLiveConfirmCancel"'), 'LIVE memiliki menu pengaturan, overlay error kamera, dan dialog akhiri siaran');
check(html.includes('visualViewport') && html.includes('rkm-live-sheet-panel') && html.includes('mask-image:linear-gradient(to bottom'), 'LIVE menyesuaikan keyboard iOS, bottom sheet, dan fade komentar');


check(socialUi.includes('var socialId=button.dataset.socialId||button.dataset.phone') && socialUi.includes('profileData.user.socialId'), 'Chat dari profil memakai ID pada tombol profil yang benar, bukan target profil sebelumnya');
check(html.includes('html.ohli-custom-icons #app svg') && html.includes('html.ohli-custom-text #app') && socialUi.includes("root.classList.toggle('ohli-custom-icons'") && socialUi.includes("root.classList.toggle('ohli-custom-text'"), 'warna ikon dan tulisan dapat diterapkan ke Social serta Chat');
check(html.includes('rkmLiveMenu') && html.includes('rkmLiveStudioSettings') && html.includes('rkmLiveStartBtn') && html.includes('rkmLiveQuality'), 'tombol tiga titik LIVE membuka pengaturan lengkap termasuk mulai siaran');


check(java.includes('private void getSocialFriends') && java.includes('private void getSocialFriendRequests') && java.includes('private void updateSocialFriendship'), 'backend menyediakan daftar teman dan siklus permintaan pertemanan');
check(java.includes('socialFriends=loadArray(socialFriendsFile,20000)') && java.includes('ohli-friends.json'), 'relasi pertemanan disimpan terpisah di server Android');
check(java.includes('friend_request') && java.includes('friend_accepted') && java.includes('Too Many Requests'), 'permintaan teman memicu notifikasi dan pembatasan spam server-side');
check(java.includes('friendRequestSent') && java.includes('friendRequestReceived') && socialUi.includes("rt.request('/api/friends')") && socialUi.includes("rt.request('/api/friends/requests')"), 'profil dan halaman Teman terhubung ke API permintaan pertemanan');
check(socialUi.includes('data-action="friend-request"') && socialUi.includes('data-action="friend-accept"') && socialUi.includes('data-action="friend-reject"') && socialUi.includes('data-action="friend-cancel"') && socialUi.includes('data-action="friend-remove"'), 'UI menyediakan tambah, terima, tolak, batalkan, dan hapus teman');
check(css.includes('.ohli-friends-toolbar') && css.includes('.ohli-friend-actions'), 'halaman Teman memiliki layout responsif tanpa mengganti tema lama');
check(java.includes('r.put("version", "3.6.4")'), 'health endpoint melaporkan v3.6.4');
check(smoke.includes("/api/friends/requests") && smoke.includes("friendRequest.requested") && smoke.includes("action: 'reject'") && smoke.includes("action: 'cancel'"), 'smoke test dua akun mencakup siklus permintaan teman');

console.log(`\nLulus ${passed} pemeriksaan statis. Ini bukan pengganti build APK atau tes runtime pada dua perangkat.`);
