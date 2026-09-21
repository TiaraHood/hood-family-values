import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const BUCKET = "family-photos";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

let currentUser = null;
let profiles = [];
let relationships = [];
let photos = [];
let assetUrls = new Map();

export function scrollToSection(id){ document.getElementById(id)?.scrollIntoView({behavior:"smooth"}); }
window.scrollToSection = scrollToSection;

async function signedUrl(path, expiresIn = 3600) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  if (assetUrls.has(path)) return assetUrls.get(path);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) { console.error("Signed URL error", error); return ""; }
  assetUrls.set(path, data.signedUrl);
  return data.signedUrl;
}

async function prepareAssets() {
  assetUrls = new Map();
  const paths = [
    ...profiles.map(p => p.photo_url).filter(Boolean),
    ...photos.map(p => p.photo_url).filter(Boolean)
  ];
  const unique = [...new Set(paths)].filter(p => !String(p).startsWith("http"));
  if (unique.length) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unique, 3600);
    if (!error && data) data.forEach(x => { if (x.path && x.signedUrl) assetUrls.set(x.path, x.signedUrl); });
  }
}

function avatar(p){
  const url = p?.photo_url ? assetUrls.get(p.photo_url) : "";
  return url || `https://ui-avatars.com/api/?name=${encodeURIComponent(p?.display_name || "Family")}&background=111111&color=F4CC59&bold=true`;
}

async function boot(){
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;
  supabase.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    await refresh();
  });
  await refresh();
}

async function refresh(){
  updateHeader();
  if (currentUser) {
    await Promise.all([loadProfiles(), loadRelationships(), loadPhotos()]);
    await prepareAssets();
  } else {
    profiles = []; relationships = []; photos = []; assetUrls = new Map();
  }
  renderTree();
  renderStats();
  renderMemberBox();
}

function updateHeader(){
  $("#userBadge").textContent = currentUser ? (currentUser.email || "Signed in").split("@")[0] : "";
}

async function loadProfiles(){
  const { data, error } = await supabase.from("profiles").select("*").order("display_name");
  if (error) { console.error(error); return; }
  profiles = data || [];
}
async function loadRelationships(){
  const { data, error } = await supabase.from("family_relationships").select("*");
  if (error) { console.error(error); return; }
  relationships = data || [];
}
async function loadPhotos(){
  const { data, error } = await supabase.from("family_photos").select("*").order("created_at", {ascending:false});
  if (error) { console.error(error); return; }
  photos = data || [];
}

function renderStats(){
  $("#memberCount").textContent = profiles.length || "0";
  const branches = new Set(relationships.map(r => r.relationship_type).filter(Boolean));
  $("#generationCount").textContent = branches.size || "0";
  $("#photoCount").textContent = photos.length || "0";
}

function renderMemberBox(){
  const box = $("#memberBox");
  if (!currentUser) {
    box.innerHTML = `<strong>Welcome</strong><p>Create your account to join the connected family tree.</p><button class="gold-btn" onclick="openAuth('login')">Log In</button>`;
    return;
  }
  const me = profiles.find(p => p.id === currentUser.id);
  box.innerHTML = `<strong>You're connected</strong><p>${esc(me?.display_name || currentUser.email)}</p><button class="gold-btn" onclick="openProfileModal()">My Profile</button><button onclick="signOut()" style="margin-top:7px">Sign Out</button>`;
}

function renderTree(){
  const c = $("#treeCanvas");
  if (!currentUser) {
    c.innerHTML = `<div class="empty-tree"><h3>Join the Hood Family Tree</h3><p>Sign up or log in to see your connected family members.</p><button class="gold-btn" onclick="openAuth('signup')">Create Account</button></div>`;
    return;
  }

  const me = profiles.find(p => p.id === currentUser.id);
  const direct = relationships.filter(r => r.member_id === currentUser.id || r.related_member_id === currentUser.id);
  const connectedIds = new Set([currentUser.id]);
  direct.forEach(r => connectedIds.add(r.member_id === currentUser.id ? r.related_member_id : r.member_id));
  const connected = profiles.filter(p => connectedIds.has(p.id));
  const others = profiles.filter(p => !connectedIds.has(p.id));

  c.innerHTML = `
    <div class="tree-grid">
      <div class="tree-row tree-center">
        ${memberCard(me, "You")}
      </div>
      <div class="tree-row">
        ${connected.filter(p => p.id !== currentUser.id).map(p => {
          const rel = direct.find(r => r.member_id === p.id || r.related_member_id === p.id);
          return memberCard(p, rel?.relationship_type || "Family Connection");
        }).join("") || `<div class="empty-tree"><p>No family connections yet.</p><button class="gold-btn" onclick="openMemberModal()">Add Family Member</button></div>`}
      </div>
      ${others.length ? `<div class="tree-row"><div class="tree-label">Other Family Members</div>${others.map(p => memberCard(p, "Family Member")).join("")}</div>` : ""}
    </div>`;
}

function memberCard(p, relation){
  return `<div class="tree-card ${p?.id === currentUser?.id ? "me" : ""}">
    <img src="${avatar(p)}" alt="">
    <strong>${esc(p?.display_name || "Family Member")}</strong>
    <small>${esc(relation || "Family")}</small>
    <button onclick="viewMember('${p.id}')">View Profile</button>
  </div>`;
}

window.viewMember = async (id) => {
  const p = profiles.find(x => x.id === id);
  if (!p) return;
  const connections = relationships.filter(r => r.member_id === id || r.related_member_id === id).map(r => {
    const otherId = r.member_id === id ? r.related_member_id : r.member_id;
    const q = profiles.find(x => x.id === otherId);
    return q ? `<div>${esc(r.relationship_type)} → ${esc(q.display_name)}</div>` : "";
  }).filter(Boolean);
  openModal(`<h2>${esc(p.display_name)}</h2><div class="profile-head"><img src="${avatar(p)}"><div><b>${esc(p.first_name || "")} ${esc(p.last_name || "")}</b><div>${esc(p.hometown || "")}</div></div></div><p>${esc(p.bio || "")}</p><h3>Family Connections</h3><div class="connections">${connections.join("") || "<em>No linked relationships yet.</em>"}</div>`);
};

function openModal(html){ $("#modalContent").innerHTML = html; $("#modalBackdrop").classList.add("open"); }
function closeModal(){ $("#modalBackdrop").classList.remove("open"); }
window.closeModal = closeModal;

window.openAuth = (type) => {
  openModal(`<h2>${type === "login" ? "Log In" : "Create Your Profile"}</h2>
    <form id="authForm">
      ${type === "signup" ? `<label>First name</label><input id="authFirst" required><label>Last name</label><input id="authLast" required>` : ""}
      <label>Email</label><input id="authEmail" type="email" required>
      <label>Password</label><input id="authPassword" type="password" minlength="6" required>
      <button class="submit">${type === "login" ? "Log In" : "Create Account"}</button>
    </form>
    <p class="form-note">If email confirmation is enabled in Supabase, check your inbox after signing up.</p>`);

  $("#authForm").onsubmit = async e => {
    e.preventDefault();
    const email = $("#authEmail").value.trim();
    const password = $("#authPassword").value;
    let result;
    if (type === "login") {
      result = await supabase.auth.signInWithPassword({email, password});
    } else {
      result = await supabase.auth.signUp({
        email,
        password,
        options: { data: { first_name: $("#authFirst").value.trim(), last_name: $("#authLast").value.trim(), display_name: `${$("#authFirst").value.trim()} ${$("#authLast").value.trim()}` } }
      });
    }
    if (result.error) { alert(result.error.message); return; }
    closeModal();
    await refresh();
    if (type === "signup" && currentUser) openProfileModal();
    else if (type === "signup") alert("Account created. Check your email to confirm your account, then log in.");
  };
};

window.requireAuth = action => { if (!currentUser) openAuth("signup"); else if (action === "createProfile") openProfileModal(); };
window.signOut = async () => { await supabase.auth.signOut(); closeModal(); };

window.openProfileModal = () => {
  if (!currentUser) return openAuth("login");
  const p = profiles.find(x => x.id === currentUser.id) || {};
  openModal(`<h2>My Profile</h2><form id="profileForm" class="form-grid">
    <div><label>First name</label><input id="pFirst" required value="${esc(p.first_name || "")}"></div>
    <div><label>Last name</label><input id="pLast" required value="${esc(p.last_name || "")}"></div>
    <div class="full"><label>Display name</label><input id="pName" required value="${esc(p.display_name || "")}"></div>
    <div><label>Hometown</label><input id="pTown" value="${esc(p.hometown || "")}"></div>
    <div><label>Birthday</label><input id="pBirthday" type="date" value="${esc(p.birthday || "")}"></div>
    <div class="full"><label>Bio</label><textarea id="pBio">${esc(p.bio || "")}</textarea></div>
    <div class="full"><label>Profile photo</label><input id="pPhoto" type="file" accept="image/*"></div>
    <div class="full"><button class="submit">Save Profile</button></div>
  </form>`);

  $("#profileForm").onsubmit = async e => {
    e.preventDefault();
    let photo_url = p.photo_url || null;
    const f = $("#pPhoto").files[0];
    if (f) {
      try { photo_url = await uploadFile(f, "avatars"); }
      catch (err) { alert(err.message || String(err)); return; }
    }
    const { error } = await supabase.from("profiles").update({
      first_name: $("#pFirst").value.trim(),
      last_name: $("#pLast").value.trim(),
      display_name: $("#pName").value.trim(),
      hometown: $("#pTown").value.trim() || null,
      birthday: $("#pBirthday").value || null,
      bio: $("#pBio").value.trim() || null,
      photo_url,
      updated_at: new Date().toISOString()
    }).eq("id", currentUser.id);
    if (error) { alert(error.message); return; }
    await refresh(); closeModal();
  };
};

window.openMemberModal = () => {
  if (!currentUser) return openAuth("login");
  openModal(`<h2>Add Family Connection</h2><p>Search for a family member who already has a profile, then choose the relationship.</p><input id="memberSearch" placeholder="Search family members"><div id="memberResults" class="directory-list"></div>`);
  $("#memberSearch").oninput = renderMemberSearch;
  renderMemberSearch();
};

function renderMemberSearch(){
  const q = $("#memberSearch").value.toLowerCase();
  const list = profiles.filter(p => p.id !== currentUser.id && `${p.display_name} ${p.first_name} ${p.last_name}`.toLowerCase().includes(q)).slice(0,20);
  $("#memberResults").innerHTML = list.map(p => `<div class="directory-item"><img src="${avatar(p)}"><div><b>${esc(p.display_name)}</b><small>${esc(p.hometown || "Family")}</small></div><button style="margin-left:auto" onclick="linkMember('${p.id}')">Connect</button></div>`).join("") || "<p>No existing profile found. Ask your relative to create an account first.</p>";
}

window.linkMember = async to => {
  const relation = prompt("What is this person's relation to you? (Example: Mother, Brother, Cousin)");
  if (!relation) return;
  const { error } = await supabase.from("family_relationships").insert({
    member_id: currentUser.id,
    related_member_id: to,
    relationship_type: relation.trim()
  });
  if (error) { alert(error.message); return; }
  await refresh(); openMemberModal();
};

window.openDirectory = () => {
  if (!currentUser) return openAuth("login");
  openModal(`<h2>Family Directory</h2><input id="dirSearch" placeholder="Search family members..."><div id="dirList" class="directory-list"></div>`);
  const render = () => {
    const q = $("#dirSearch").value.toLowerCase();
    $("#dirList").innerHTML = profiles.filter(p => `${p.display_name} ${p.first_name} ${p.last_name}`.toLowerCase().includes(q)).map(p => `<div class="directory-item"><img src="${avatar(p)}"><div><b>${esc(p.display_name)}</b><small>${esc(p.hometown || "Family")}</small></div><button style="margin-left:auto" onclick="viewMember('${p.id}')">View</button></div>`).join("");
  };
  $("#dirSearch").oninput = render; render();
};

window.openPhotoModal = () => {
  if (!currentUser) return openAuth("login");
  openModal(`<h2>Family Photos</h2><p>Upload reunion memories to the private shared family album.</p><input id="photoFiles" type="file" accept="image/*" multiple><div id="photoGallery" class="photo-preview">${photos.map(p => `<img src="${assetUrls.get(p.photo_url) || ""}" alt="">`).join("")}</div>`);
  $("#photoFiles").onchange = async e => {
    for (const f of [...e.target.files]) {
      try {
        const path = await uploadFile(f, "photos");
        const { error } = await supabase.from("family_photos").insert({uploaded_by:currentUser.id, photo_url:path, caption:null, album:"Family Photos"});
        if (error) throw error;
      } catch (err) { alert(err.message || String(err)); }
    }
    await refresh(); openPhotoModal();
  };
};

async function uploadFile(file, folder){
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${folder}/${currentUser.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {upsert:false, contentType:file.type, cacheControl:"3600"});
  if (error) throw error;
  return path;
}

window.openInfo = async type => {
  if (type === "announcements") {
    const { data, error } = await supabase.from("announcements").select("*").order("created_at", {ascending:false});
    if (error) { alert(error.message); return; }
    openModal(`<h2>Family Announcements</h2>${(data||[]).map(a => `<article class="notice"><h3>${esc(a.title)}</h3><p>${esc(a.message)}</p></article>`).join("") || "<p>No announcements yet.</p>"}`);
  } else {
    const { data, error } = await supabase.from("reunion_info").select("*").order("updated_at", {ascending:false}).limit(1).maybeSingle();
    if (error) { alert(error.message); return; }
    openModal(`<h2>${esc(data?.title || "Annual Family Remix Reunion")}</h2><p>${esc(data?.description || "Reunion details will be posted here.")}</p><div class="reunion-details"><b>Date:</b> ${esc(data?.reunion_date || "To be announced")}<br><b>Location:</b> ${esc(data?.location || "To be announced")}<br><p>${esc(data?.details || "")}</p></div>`);
  }
};

$("#modalBackdrop").addEventListener("click", e => { if (e.target.id === "modalBackdrop") closeModal(); });
$("#loginBtn").onclick = () => openAuth("login");
$("#signupBtn").onclick = () => openAuth("signup");
$("#searchBtn").onclick = () => openDirectory();
$("#mobileMenu").onclick = () => { document.querySelector("nav")?.classList.toggle("mobile-open"); };
boot();
