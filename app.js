import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, remove, update, runTransaction, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

/* ================= FIREBASE CONFIG ================= */
const firebaseConfig = {
    apiKey: "AIzaSyALS4Sy7J5NVXG9JCmdk0ZPMaHxamJvA_Q",
    databaseURL: "https://medical-inventory-ef978-default-rtdb.firebaseio.com/",
    projectId: "medical-inventory-ef978",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

/* ================= GLOBAL STATE ================= */
let allLogs = [];
let lowStockItems = [];
let currentLogView = "requests";

/* ================= AUTH & UI STATE ================= */
onAuthStateChanged(auth, user => {
    const isAdmin = !!user;
    document.body.classList.toggle("is-admin", isAdmin);

    document.getElementById("logoutBtn").style.display = isAdmin ? "block" : "none";
    document.getElementById("loginTrigger").style.display = isAdmin ? "none" : "flex";

    const employeeIcon = document.getElementById("employeeTrigger");
    if (employeeIcon) employeeIcon.style.display = isAdmin ? "flex" : "none";

    if (isAdmin) {
        loadReports();
        loadEmployees();
        document.getElementById("adminEmail").value = "";
        document.getElementById("adminPass").value = "";
    }
});

/* ================= INVENTORY SYNC ================= */
onValue(ref(db, "inventory"), snapshot => {
    const data = snapshot.val() || {};
    const tbody = document.getElementById("inventoryBody");
    const select = document.getElementById("reqItemSelect");
    const empSelect = document.getElementById("empItemSelect");

    tbody.innerHTML = "";
    select.innerHTML = '<option value="">Select Item...</option>';
    if (empSelect) empSelect.innerHTML = '<option value="">Select Item...</option>';

    lowStockItems = [];

    Object.keys(data).forEach(key => {
        const item = data[key];
        const qty = parseInt(item.quantity) || 0;
        const isLow = qty <= 5;
        if (isLow) lowStockItems.push({ name: item.name, quantity: qty });

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${item.name}</td>
            <td><span class="stock-tag ${isLow ? 'low' : 'ok'}">${qty}</span></td>
            <td class="admin-only">
                <button class="btn-edit btn-primary" data-id="${key}" style="background:var(--warning);padding:5px 10px;">Edit</button>
                <button class="btn-delete btn-danger" data-id="${key}" style="padding:5px 10px;">Del</button>
            </td>`;
        tbody.appendChild(tr);

        const opt = `<option value="${key}">${item.name}</option>`;
        select.innerHTML += opt;
        if (empSelect) empSelect.innerHTML += opt;
    });

    // Low stock bell
    const bell = document.getElementById("lowStockAlert");
    const showBell = auth.currentUser && lowStockItems.length > 0;
    bell.style.display = showBell ? "flex" : "none";
    bell.classList.toggle("lowstock-wiggle", showBell);
});

/* ================= INVENTORY BUTTONS (Delegation Fixed) ================= */
document.getElementById("inventoryBody").addEventListener("click", async e => {
    const btn = e.target;
    const tr = btn.closest("tr");
    if (!tr) return;

    if (btn.classList.contains("btn-edit")) {
        // Read values directly from row cells
        const name = tr.cells[0].innerText;
        const qty = tr.cells[1].innerText.replace(/\D/g, ""); // extract number
        const id = btn.dataset.id;

        document.getElementById("editItemId").value = id;
        document.getElementById("itemName").value = name;
        document.getElementById("itemQty").value = qty;
        document.getElementById("saveBtn").innerText = "Update Item";

    } else if (btn.classList.contains("btn-delete")) {
        if (confirm("Delete this item?")) {
            await remove(ref(db, `inventory/${btn.dataset.id}`));
        }
    }
});
/* ================= INVENTORY SAVE/UPDATE ================= */
document.getElementById("saveBtn").onclick = async () => {
    const id = document.getElementById("editItemId").value || push(ref(db, "inventory")).key; // generate key if new
    const name = document.getElementById("itemName").value.trim();
    const qty = parseInt(document.getElementById("itemQty").value);

    if (!name || isNaN(qty)) return alert("Enter item name and quantity");

    try {
        await update(ref(db, `inventory/${id}`), { 
            name: name, 
            quantity: qty 
        });

        alert("Inventory updated successfully!");
        ["editItemId", "itemName", "itemQty"].forEach(i => document.getElementById(i).value = "");
        document.getElementById("saveBtn").innerText = "Add / Update";
    } catch (err) {
        console.error("Inventory update failed:", err);
        alert("Error saving item");
    }
};



/* ================= EMPLOYEE MANAGEMENT ================= */
function loadEmployees() {
    onValue(ref(db, "employees"), snapshot => {
        const tbody = document.querySelector("#employeeTable tbody");
        tbody.innerHTML = "";
        const data = snapshot.val() || {};

        Object.keys(data).forEach(id => {
            const emp = data[id];
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${emp.name}</td>
                <td>${id}</td>
                <td class="admin-only">
                    <button class="btn-emp-edit btn-primary" data-id="${id}" style="padding:5px 10px;">Edit</button>
                    <button class="btn-emp-del btn-danger" data-id="${id}" style="padding:5px 10px;">Del</button>
                </td>`;
            tbody.appendChild(tr);
        });
    });
}

// Employee buttons delegation
document.querySelector("#employeeTable tbody").addEventListener("click", async e => {
    const btn = e.target;
    const tr = btn.closest("tr");
    if (!tr) return;

    if (btn.classList.contains("btn-emp-edit")) {
        const name = tr.cells[0].innerText;
        const id = btn.dataset.id;

        document.getElementById("editEmpId").value = id;
        document.getElementById("empIDAdmin").value = id;
        document.getElementById("empNameAdmin").value = name;
        document.getElementById("saveEmpBtn").innerText = "Update Employee";

    } else if (btn.classList.contains("btn-emp-del")) {
        if (confirm("Delete employee?")) {
            await remove(ref(db, `employees/${btn.dataset.id}`));
        }
    }
});

/* ================= ADMIN: SAVE EMPLOYEE ================= */
document.getElementById("saveEmpBtn")?.addEventListener("click", async () => {
    const oldId = document.getElementById("editEmpId").value;
    const newId = document.getElementById("empIDAdmin").value.trim();
    const name = document.getElementById("empNameAdmin").value.trim();
    if (!newId || !name) return alert("Enter Name and ID");

    try {
        if (oldId && oldId !== newId) {
            await remove(ref(db, `employees/${oldId}`));
        }
        await update(ref(db, `employees/${newId}`), { name, id: newId });
        alert("Employee database updated successfully!");
        ["editEmpId", "empNameAdmin", "empIDAdmin"].forEach(i => document.getElementById(i).value = "");
        document.getElementById("saveEmpBtn").innerText = "Add / Update";
    } catch (err) {
        console.error("Update failed:", err);
        alert("Error updating employee.");
    }
});

/* ================= AUTH ================= */
document.getElementById("loginTrigger").onclick = () => document.getElementById("loginModal").style.display = "flex";
document.getElementById("closeModal").onclick = () => document.getElementById("loginModal").style.display = "none";
document.getElementById("logoutBtn").onclick = () => signOut(auth);
document.getElementById("loginBtn").onclick = async () => {
    const email = document.getElementById("adminEmail").value;
    const pass = document.getElementById("adminPass").value;
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        document.getElementById("loginModal").style.display = "none";
    } catch {
        alert("Login failed. Check credentials.");
    }
};

/* ================= LOW STOCK ALERT ================= */
document.getElementById("lowStockAlert").onclick = () => {
    const list = document.getElementById("lowStockList");
    list.innerHTML = lowStockItems.map(i => `<li>${i.name} (Stock: ${i.quantity})</li>`).join("");
    document.getElementById("lowStockModal").style.display = "flex";
};
document.getElementById("closeLowStockModal").onclick = () => document.getElementById("lowStockModal").style.display = "none";

/* ================= EMPLOYEE MODAL ================= */
const employeeTrigger = document.getElementById("employeeTrigger");
if (employeeTrigger) {
    employeeTrigger.onclick = () => document.getElementById("employeeModal").style.display = "flex";
}
document.getElementById("closeEmployeeModal")?.addEventListener("click", () => {
    document.getElementById("employeeModal").style.display = "none";
});

/* ================= LOGS ================= */
async function logAdminAction(action, item, details, qty) {
    if (!auth.currentUser) return;
    await push(ref(db, "admin_logs"), {
        admin: auth.currentUser.email,
        action, item, details, quantity: qty,
        date: new Date().toISOString()
    });
}

function loadReports() {
    const path = currentLogView === "requests" ? "transactions" : "admin_logs";
    onValue(ref(db, path), snapshot => {
        allLogs = snapshot.val() ? Object.values(snapshot.val()) : [];
        renderFilteredReports();
    });
}

function renderFilteredReports() {
    const filter = document.getElementById("logFilterMonth").value;
    const filteredLogs = allLogs.filter(l => !filter || (l.date && l.date.startsWith(filter)));
    let html = `<table><thead><tr>
        <th>Date</th>
        <th>${currentLogView === 'requests' ? 'User' : 'Admin'}</th>
        <th>${currentLogView === 'requests' ? 'Item' : 'Action'}</th>
        <th>Qty</th>
        <th>${currentLogView === 'requests' ? 'Purpose' : 'Item'}</th>
    </tr></thead><tbody>`;

    if (!filteredLogs.length) html += `<tr><td colspan="5" style="text-align:center;">No records found</td></tr>`;
    else filteredLogs.slice().reverse().forEach(l => {
        html += `<tr>
            <td><small>${new Date(l.date).toLocaleDateString()}</small></td>
            <td>${currentLogView === 'requests' ? l.requester : (l.admin || "").split("@")[0]}</td>
            <td>${currentLogView === 'requests' ? l.itemName : l.action}</td>
            <td>${currentLogView === 'requests' ? l.qty : l.quantity}</td>
            <td>${currentLogView === 'requests' ? (l.purpose || "-") : l.item}</td>
        </tr>`;
    });

    document.getElementById("reportTableContainer").innerHTML = html + "</tbody></table>";
}

document.getElementById("logTypeSelect").onchange = e => { currentLogView = e.target.value; loadReports(); };
document.getElementById("logFilterMonth").onchange = renderFilteredReports;

/* ================= CSV EXPORT ================= */
document.getElementById("downloadCsvBtn").onclick = () => {
    if (!allLogs.length) return alert("No data to export");
    const headers = currentLogView === "requests" 
        ? ["Date", "Requester", "Item", "Quantity", "Purpose"]
        : ["Date", "Admin", "Action", "Item", "Quantity"];

    const rows = allLogs.map(l => currentLogView === "requests" 
        ? [l.date, l.requester, l.itemName, l.qty, l.purpose] 
        : [l.date, l.admin, l.action, l.item, l.quantity]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_${currentLogView}.csv`;
    a.click();
};

/* ================= NAVBAR SCROLL ================= */
let lastScrollTop = 0;
window.addEventListener('scroll', () => {
    const navbar = document.getElementById('mainNav');
    let st = window.pageYOffset || document.documentElement.scrollTop;
    if (st > lastScrollTop && st > 100) navbar.classList.add('nav-up');
    else navbar.classList.remove('nav-up');
    lastScrollTop = st <= 0 ? 0 : st;
});

/* ================= FORM TOGGLE LOGIC ================= */
const toggleBtn = document.getElementById("formToggleBtn");
const requestSection = document.getElementById("requestSection");
const requestFields = document.getElementById("requestFields");
const formTitle = document.getElementById("formTitle");

let isPPEMode = false;

toggleBtn.onclick = () => {
    // Start fade out
    requestFields.classList.add("form-hidden");

    setTimeout(() => {
        isPPEMode = !isPPEMode;
        
        // Toggle Class and Text
        requestSection.classList.toggle("mode-ppe", isPPEMode);
        formTitle.innerText = isPPEMode ? "🛡️ PPE Request Form" : "📋 Item Request Form";
        toggleBtn.title = isPPEMode ? "Switch to MedKit Request" : "Switch to PPE Request";

        // Clear fields on switch
        ["reqName", "reqID", "reqQty", "reqPurpose"].forEach(i => document.getElementById(i).value = "");
        
        // Fade back in
        requestFields.classList.remove("form-hidden");
    }, 300);
};
