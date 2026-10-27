/* SAAD Spice Data
 * Local mode works without Firebase. To enable email accounts/cloud sync:
 * 1) Create a Firebase project and enable Authentication > Email/Password.
 * 2) Create Firestore database.
 * 3) Copy your web app config into FIREBASE_CONFIG below.
 * 4) Publish the included firestore.rules rules.
 */
const FIREBASE_CONFIG = {
  apiKey: "PASTE_YOUR_FIREBASE_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  appId: "PASTE_YOUR_FIREBASE_APP_ID"
};
let cloudReady = false, authAction = "login", currentUser = null, cloudTimer = null;
let items = JSON.parse(localStorage.getItem("spice_items") || "null") || [
 {name:"كمون مطحون",type:"مطحون",price:5},
 {name:"فلفل أسود حب",type:"حب",price:8},
 {name:"هيل مطحون",type:"مطحون",price:20},
 {name:"كزبرة حب",type:"حب",price:4}
];
let invoices = JSON.parse(localStorage.getItem("spice_invoices") || "[]");
let currentInvoiceItems = [], selectedCustomerReportData = null;
const $ = id => document.getElementById(id);
const money = n => Number(n || 0).toFixed(2);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function saveData(){
 localStorage.setItem("spice_items",JSON.stringify(items));
 localStorage.setItem("spice_invoices",JSON.stringify(invoices));
 if(currentUser && cloudReady){ clearTimeout(cloudTimer); cloudTimer=setTimeout(syncCloud,500); }
}
function showCloudNotice(msg){$("cloudNotice").textContent=msg;$("cloudNotice").classList.remove("hidden");}
function switchTab(id){
 document.querySelectorAll(".tab-content").forEach(e=>e.classList.remove("active"));
 $(id).classList.add("active");
 document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("bg-green-950","font-bold"));
 const idx={pos:0,items:1,invoices:2,markets:3,reports:4}[id];
 document.querySelectorAll(".nav-btn")[idx]?.classList.add("bg-green-950","font-bold");
 if(id==="pos"){renderPosItems();renderCurrentInvoice();}
 if(id==="items")renderItemsTable();
 if(id==="invoices")renderInvoicesList();
 if(id==="markets")renderMarkets();
 if(id==="reports")updateReportCustomersDropdown();
}
function openItemModal(){ $("editIndex").value="-1";$("itemFormTitle").textContent="إضافة صنف";$("itemForm").reset();$("itemModal").classList.add("active"); }
function closeItemModal(){$("itemModal").classList.remove("active");}
function handleItemSubmit(e){
 e.preventDefault(); const item={name:$("itemName").value.trim(),type:$("itemType").value,price:Number($("itemPrice").value)};
 if(!item.name || !Number.isFinite(item.price) || item.price<0)return alert("تحقق من اسم الصنف والسعر.");
 const i=Number($("editIndex").value); if(i<0)items.push(item);else items[i]=item;
 closeItemModal();saveData();renderItemsTable();renderPosItems();
}
function renderItemsTable(){
 $("itemsTableBody").innerHTML=items.map((it,i)=>`<tr class="border-b"><td class="p-3 font-bold">${esc(it.name)}</td><td class="p-3">${esc(it.type)}</td><td class="p-3">${money(it.price)}</td><td class="p-3">${it.type==="مطحون"?"بكت (4 عبوات)":"عبوة"}</td><td class="p-3 whitespace-nowrap"><button class="text-blue-700 ml-3" onclick="editItem(${i})">تعديل</button><button class="text-red-600" onclick="deleteItem(${i})">حذف</button></td></tr>`).join("");
}
function editItem(i){const it=items[i];$("itemName").value=it.name;$("itemType").value=it.type;$("itemPrice").value=it.price;$("editIndex").value=i;$("itemFormTitle").textContent="تعديل الصنف";$("itemModal").classList.add("active");}
function deleteItem(i){if(confirm("هل تريد حذف هذا الصنف؟")){items.splice(i,1);saveData();renderItemsTable();renderPosItems();}}
function renderPosItems(){
 const q=$("posSearch").value.trim().toLowerCase();
 $("posItemsGrid").innerHTML=items.filter(i=>i.name.toLowerCase().includes(q)).map((it,i)=>`<button onclick="addToInvoice(${items.indexOf(it)})" class="p-4 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl text-right"><span class="font-bold text-green-900 block">${esc(it.name)}</span><span class="text-sm text-gray-600 block mt-2">${money(it.price)} للعبوة</span><span class="text-xs text-gray-500">${it.type==="مطحون"?"مطحون — بكت 4 عبوات":"حب — عبوة"}</span></button>`).join("") || `<p class="text-gray-500">لا توجد أصناف مطابقة.</p>`;
}
function addToInvoice(i){
 const it=items[i]; if(!it)return;
 const qty=it.type==="مطحون"?4:1; const existing=currentInvoiceItems.find(x=>x.name===it.name);
 if(existing)existing.qty+=qty;else currentInvoiceItems.push({...it,qty});
 renderCurrentInvoice();
}
function updateQty(i,delta){if(!currentInvoiceItems[i])return;currentInvoiceItems[i].qty+=delta;if(currentInvoiceItems[i].qty<=0)currentInvoiceItems.splice(i,1);renderCurrentInvoice();}
function setInvoicePrice(i,value){const n=Number(value);if(Number.isFinite(n)&&n>=0){currentInvoiceItems[i].price=n;renderCurrentInvoice();}}
function renderCurrentInvoice(){
 const list=$("invoiceItemsList");
 if(!currentInvoiceItems.length){list.innerHTML='<p class="text-gray-400 text-center p-4">الفاتورة فارغة حالياً</p>';$("invoiceTotal").textContent="0.00";return;}
 list.innerHTML=currentInvoiceItems.map((it,i)=>`<div class="border-b pb-3 mb-2"><div class="flex justify-between gap-2"><strong>${esc(it.name)}</strong><button class="text-red-600" onclick="currentInvoiceItems.splice(${i},1);renderCurrentInvoice()">حذف</button></div><div class="grid grid-cols-3 gap-2 mt-2 text-sm"><label>سعر العبوة<input type="number" min="0" step="0.01" value="${it.price}" onchange="setInvoicePrice(${i},this.value)" class="border rounded p-1 w-full"></label><div><span>الكمية</span><div class="flex items-center gap-2 mt-1"><button onclick="updateQty(${i},-1)" class="bg-gray-200 rounded px-2">−</button><b>${it.qty}</b><button onclick="updateQty(${i},1)" class="bg-gray-200 rounded px-2">+</button></div></div><div><span>الإجمالي</span><b class="block mt-2">${money(it.price*it.qty)}</b></div></div></div>`).join("");
 $("invoiceTotal").textContent=money(currentInvoiceItems.reduce((s,i)=>s+i.price*i.qty,0));
}
function customerFromForm(){return {market:$("custMarket").value.trim(),manager:$("custManager").value.trim(),phone:$("custPhone").value.trim(),address:$("custAddress").value.trim(),location:$("custLocation").value.trim()};}
function saveInvoice(){
 const customer=customerFromForm();if(!customer.market)return alert("يرجى إدخال اسم الماركت.");if(!currentInvoiceItems.length)return alert("الفاتورة فارغة.");
 const inv={id:Date.now(),customer,date:new Date().toISOString(),items:currentInvoiceItems.map(i=>({...i})),total:currentInvoiceItems.reduce((s,i)=>s+i.price*i.qty,0)};
 invoices.push(inv);saveData();alert("تم حفظ الفاتورة.");renderCurrentInvoice();renderMarkets();
 const printHtml=`<h1>SAAD — فاتورة</h1><p>الماركت: ${esc(customer.market)}</p><p>التاريخ: ${new Date(inv.date).toLocaleString("ar")}</p><table border="1" cellspacing="0" cellpadding="8"><tr><th>الصنف</th><th>سعر العبوة</th><th>الكمية</th><th>الإجمالي</th></tr>${inv.items.map(i=>`<tr><td>${esc(i.name)}</td><td>${money(i.price)}</td><td>${i.qty}</td><td>${money(i.price*i.qty)}</td></tr>`).join("")}</table><h3>الإجمالي: ${money(inv.total)}</h3>`;
 const w=window.open("","_blank");if(w){w.document.write(`<html dir="rtl"><meta charset="utf-8"><title>فاتورة SAAD</title><body style="font-family:Arial;padding:24px">${printHtml}<script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();}
 currentInvoiceItems=[];["custMarket","custManager","custPhone","custAddress","custLocation"].forEach(id=>$(id).value="");renderCurrentInvoice();
}
function renderInvoicesList(){
 const arr=[...invoices].reverse();$("invoicesListContainer").innerHTML=arr.length?arr.map(inv=>`<article class="border rounded-xl p-4"><div class="flex justify-between gap-3 flex-wrap"><div><b class="text-green-900">${esc(inv.customer.market)}</b><p class="text-sm text-gray-500">${new Date(inv.date).toLocaleString("ar")}</p></div><b>${money(inv.total)}</b></div><ul class="my-3 list-disc list-inside">${inv.items.map(i=>`<li>${esc(i.name)} — ${i.qty} × ${money(i.price)} = ${money(i.qty*i.price)}</li>`).join("")}</ul><button class="text-red-600 text-sm" onclick="deleteInvoice(${inv.id})">حذف هذه الفاتورة</button></article>`).join(""):'<p class="text-gray-500">لا توجد فواتير محفوظة.</p>';
}
function deleteInvoice(id){if(confirm("حذف هذه الفاتورة نهائياً؟")){invoices=invoices.filter(i=>i.id!==id);saveData();renderInvoicesList();renderMarkets();}}
function marketNames(){return [...new Set(invoices.map(i=>i.customer.market).filter(Boolean))];}
function renderMarkets(){
 const names=marketNames();$("marketNames").innerHTML=names.map(n=>`<option value="${esc(n)}"></option>`).join("");
 $("marketsList").innerHTML=names.length?names.map(n=>{const count=invoices.filter(i=>i.customer.market===n).length;return `<div class="border rounded-xl p-4 flex justify-between items-center gap-3"><div><b>${esc(n)}</b><p class="text-sm text-gray-500">${count} فاتورة</p></div><button class="bg-red-600 text-white rounded-lg px-3 py-2" onclick="deleteMarket('${encodeURIComponent(n)}')">حذف الماركت وفواتيره</button></div>`}).join(""):'<p class="text-gray-500">لا توجد ماركتات محفوظة بعد.</p>';
}
function deleteMarket(encoded){const name=decodeURIComponent(encoded);if(confirm(`سيتم حذف الماركت "${name}" وجميع فواتيره. هل تريد المتابعة؟`)){invoices=invoices.filter(i=>i.customer.market!==name);saveData();renderMarkets();renderInvoicesList();updateReportCustomersDropdown();}}
function updateReportCustomersDropdown(){
 const s=$("reportCustomerSelect"),old=s.value,names=marketNames();s.innerHTML='<option value="">-- اختر --</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("");if(names.includes(old))s.value=old;generateCustomerReport();
}
function generateCustomerReport(){
 const market=$("reportCustomerSelect").value;const list=invoices.filter(i=>i.customer.market===market);const div=$("customerReportResult");
 if(!market||!list.length){div.classList.add("hidden");selectedCustomerReportData=null;return;}
 const info=list[list.length-1].customer,total=list.reduce((s,i)=>s+Number(i.total||0),0),counts={};
 list.forEach(inv=>inv.items.forEach(it=>{counts[it.name]??={type:it.type,qty:0};counts[it.name].qty+=Number(it.qty||0);}));
 const sorted=Object.entries(counts).sort((a,b)=>b[1].qty-a[1].qty);const top=sorted[0]?.[0]||"-";
 $("repMarketName").textContent=`${info.market} — المسؤول: ${info.manager||"-"} — الهاتف: ${info.phone||"-"} — العنوان: ${info.address||"-"}`;
 $("repTotalInvoices").textContent=list.length;$("repTotalSpent").textContent=money(total);$("repTopItem").textContent=top;
 $("repItemsTableBody").innerHTML=sorted.map(([name,d])=>`<tr class="border-b"><td class="p-3">${esc(name)}</td><td class="p-3">${esc(d.type)}</td><td class="p-3">${d.qty}</td></tr>`).join("");
 selectedCustomerReportData={market:info.market,manager:info.manager,phone:info.phone,totalInvoices:list.length,totalSpent:money(total),topItem:top};div.classList.remove("hidden");
}
function shareReportWhatsApp(){if(!selectedCustomerReportData)return alert("اختر ماركتاً أولاً.");const d=selectedCustomerReportData;const msg=`تقرير الزبون - SAAD\nالماركت: ${d.market}\nالمسؤول: ${d.manager||"-"}\nالهاتف: ${d.phone||"-"}\nعدد الفواتير: ${d.totalInvoices}\nإجمالي المشتريات: ${d.totalSpent}\nالأكثر طلباً: ${d.topItem}`;window.open("https://wa.me/?text="+encodeURIComponent(msg),"_blank");}
function openAuth(){$("authMessage").textContent="";$("authModal").classList.add("active");}
function closeAuth(){$("authModal").classList.remove("active");}
async function authSubmit(e){
 e.preventDefault();if(!cloudReady)return $("authMessage").textContent="التسجيل السحابي غير مفعّل بعد. اتبع خطوات README وأضف إعدادات Firebase في app.js.";
 const email=$("authEmail").value.trim(),pass=$("authPassword").value;
 try{if(authAction==="register")await firebase.auth().createUserWithEmailAndPassword(email,pass);else await firebase.auth().signInWithEmailAndPassword(email,pass);closeAuth();}
 catch(err){$("authMessage").textContent=authError(err);}
}
function authError(e){return ({"auth/email-already-in-use":"هذا البريد مسجل مسبقاً.","auth/invalid-email":"البريد الإلكتروني غير صالح.","auth/weak-password":"كلمة المرور ضعيفة.","auth/user-not-found":"لا يوجد حساب بهذا البريد.","auth/wrong-password":"كلمة المرور غير صحيحة.","auth/invalid-credential":"البريد أو كلمة المرور غير صحيحة."})[e.code]||"تعذر إتمام العملية: "+e.message;}
async function syncCloud(){
 if(!currentUser||!cloudReady)return;
 try{await firebase.firestore().collection("users").doc(currentUser.uid).set({items,invoices,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});showCloudNotice("تمت مزامنة البيانات مع حسابك.");}
 catch(e){showCloudNotice("تعذرت المزامنة السحابية: "+e.message);}
}
async function loadCloud(){
 if(!currentUser||!cloudReady)return;
 try{const ref=firebase.firestore().collection("users").doc(currentUser.uid),snap=await ref.get();if(snap.exists){const d=snap.data();if(Array.isArray(d.items))items=d.items;if(Array.isArray(d.invoices))invoices=d.invoices;localStorage.setItem("spice_items",JSON.stringify(items));localStorage.setItem("spice_invoices",JSON.stringify(invoices));}else await syncCloud();renderPosItems();renderCurrentInvoice();renderItemsTable();renderInvoicesList();renderMarkets();updateReportCustomersDropdown();showCloudNotice("تم تحميل بيانات حسابك السحابية.");}
 catch(e){showCloudNotice("تعذر تحميل البيانات: "+e.message);}
}
async function logout(){if(cloudReady)await firebase.auth().signOut();}
function initFirebase(){
 const configured=FIREBASE_CONFIG.apiKey&&!FIREBASE_CONFIG.apiKey.startsWith("PASTE_")&&FIREBASE_CONFIG.projectId&&!FIREBASE_CONFIG.projectId.startsWith("PASTE_");
 if(!configured||!window.firebase){showCloudNotice("التطبيق يعمل محلياً. لتفعيل التسجيل والمزامنة عبر البريد، أكمل إعداد Firebase في README.md.");return;}
 try{firebase.initializeApp(FIREBASE_CONFIG);cloudReady=true;firebase.auth().onAuthStateChanged(async user=>{currentUser=user;$("authStatus").textContent=user?user.email:"غير مسجل";$("authOpenBtn").classList.toggle("hidden",!!user);$("logoutBtn").classList.toggle("hidden",!user);if(user)await loadCloud();else showCloudNotice("لم تسجل الدخول. البيانات الجديدة تحفظ محلياً على هذا الجهاز.");});}
 catch(e){showCloudNotice("إعداد Firebase غير صحيح: "+e.message);}
}
function init(){renderPosItems();renderCurrentInvoice();renderItemsTable();renderInvoicesList();renderMarkets();updateReportCustomersDropdown();initFirebase();}
init();
