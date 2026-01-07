const API_BASE = 'https://world.openfoodfacts.org/api/v2/product/';
let scanner = null;

// Auth Helper Functions
window.openAuthModal = () => document.getElementById('auth-modal').classList.add('active');
window.closeAuthModal = () => document.getElementById('auth-modal').classList.remove('active');
window.toggleAuthView = (view) => {
    document.getElementById('login-view').style.display = view === 'login' ? 'block' : 'none';
    document.getElementById('register-view').style.display = view === 'register' ? 'block' : 'none';
};

// Auth Manager
class AuthManager {
    constructor() {
        this.user = JSON.parse(localStorage.getItem('ha_user')) || null;
        this.updateUI();
    }

    login(email, password) {
        this.user = { id: Date.now(), email, name: email.split('@')[0], status: 'Premium' };
        localStorage.setItem('ha_user', JSON.stringify(this.user));
        this.updateUI();
        window.closeAuthModal();
        loadProfile();
        loadHistory();
    }

    register(name, email, password) {
        this.user = { id: Date.now(), email, name, status: 'Premium' };
        localStorage.setItem('ha_user', JSON.stringify(this.user));
        this.updateUI();
        window.closeAuthModal();
        loadProfile();
        loadHistory();
    }

    googleLogin() {
        this.user = { id: Date.now(), email: 'google.user@example.com', name: 'Google User', status: 'Premium' };
        localStorage.setItem('ha_user', JSON.stringify(this.user));
        this.updateUI();
        window.closeAuthModal();
        loadProfile();
        loadHistory();
    }

    logout() {
        this.user = null;
        localStorage.removeItem('ha_user');
        this.updateUI();
        loadProfile();
        loadHistory();
        showSection('scan-section');
    }

    updateUI() {
        const guestView = document.getElementById('guest-profile');
        const userView = document.getElementById('user-profile');
        if (!guestView || !userView) return;

        if (this.user) {
            guestView.classList.add('hidden');
            userView.classList.remove('hidden');
            document.getElementById('display-name').innerText = this.user.name;
            document.getElementById('avatar-circle').innerText = this.user.name[0].toUpperCase();
        } else {
            guestView.classList.remove('hidden');
            userView.classList.add('hidden');
        }
    }

    getDataKey(baseKey) {
        return this.user ? `${baseKey}_${this.user.id}` : baseKey;
    }
}

const authManager = new AuthManager();
window.authManager = authManager;

// DOM Elements
const sections = document.querySelectorAll('.section');
const navTabs = document.querySelectorAll('.nav-tab');
const startScannerBtn = document.getElementById('trigger-scan');
const barcodeInput = document.getElementById('barcode-input');
const manualSearchBtn = document.getElementById('manual-search-btn');
const recentScansList = document.getElementById('recent-scans-list');
const fullHistoryList = document.getElementById('full-history-list');
const productDetailsPage = document.getElementById('product-details-page');
const productDetailsContent = document.getElementById('product-details-content');

// State
let profile = {
    vegan: false,
    gluten_free: false,
    nuts: false
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadProfile();
    loadHistory();
    setupNavigation();
    setupScanner();
    setupEventListeners();
});

// Navigation Logic
function setupNavigation() {
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-target');
            showSection(target);
            navTabs.forEach(n => n.classList.remove('active'));
            tab.classList.add('active');
        });
    });
}

function showSection(id) {
    sections.forEach(section => {
        section.classList.remove('active');
        if (section.id === id) section.classList.add('active');
    });
}

// Scanner Logic
function setupScanner() {
    if (!document.getElementById("scanner-container")) return;
    scanner = new Html5Qrcode("scanner-container");

    startScannerBtn.addEventListener('click', () => {
        if (scanner.getState() === 2) { // Already scanning
            return;
        }

        const config = { fps: 15, qrbox: { width: 250, height: 150 } };
        scanner.start(
            { facingMode: "environment" },
            config,
            onScanSuccess,
            (err) => { }
        ).then(() => {
            console.log("Scanner started");
        }).catch(err => {
            displayCameraError(err);
        });
    });
}

function onScanSuccess(decodedText) {
    if (scanner) scanner.stop();
    fetchProduct(decodedText);
}

function displayCameraError(error) {
    const container = document.getElementById("scanner-container");
    if (!container) return;

    container.innerHTML = `
        <div class="camera-error-container">
            <i data-lucide="camera-off" class="camera-error-icon" size="48"></i>
            <div class="camera-error-title">Camera Access Denied</div>
            <div class="camera-error-msg">
                We need camera permission to scan barcodes. 
                Please enable camera access in your browser settings and try again.
            </div>
            <button class="camera-retry-btn" onclick="location.reload()">Retry Now</button>
        </div>
    `;
    lucide.createIcons();
}

async function fetchProduct(barcode) {
    openProductDetails('Searching...');

    // Check Cache
    const key = authManager.getDataKey('ha_history');
    const history = JSON.parse(localStorage.getItem(key) || '[]');
    const cached = history.find(p => p.code === barcode);

    if (!navigator.onLine && cached && cached.fullData) {
        renderProduct(cached.fullData);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}${barcode}.json`);
        const data = await response.json();

        if (data.status === 1) {
            renderProduct(data.product);
            saveToHistory(data.product);
        } else {
            productDetailsContent.innerHTML = `
                <div class="glass-panel" style="text-align: center; padding: 40px 20px;">
                    <i data-lucide="search-x" size="48" style="color: var(--text-muted); margin-bottom: 20px;"></i>
                    <h3>Product Not Found</h3>
                    <p class="subtitle">Barcode: ${barcode}</p>
                </div>
            `;
            lucide.createIcons();
        }
    } catch (err) {
        if (cached && cached.fullData) {
            renderProduct(cached.fullData);
        } else {
            productDetailsContent.innerHTML = `<div class="glass-panel" style="text-align: center; color: var(--danger); padding: 40px 20px;">Network Error. Check connection.</div>`;
        }
    }
}

// UI Rendering
function openProductDetails(initialMsg = '') {
    productDetailsPage.classList.add('active');
    if (initialMsg) {
        productDetailsContent.innerHTML = `<div style="text-align:center; padding: 50px;">${initialMsg}</div>`;
    }
}

window.closeProductDetails = () => {
    productDetailsPage.classList.remove('active');
};

function renderProduct(product) {
    const {
        product_name,
        brands,
        image_front_url,
        nutrition_grades,
        ecoscore_grade,
        ingredients_text,
        generic_name
    } = product;

    const nutriClass = `nutri-${(nutrition_grades || 'e').toLowerCase()}`;
    const analysis = analyzeDietary(product);
    const insights = getProductInsights(product);

    productDetailsContent.innerHTML = `
        <div class="glass-panel" style="text-align: center; margin-bottom: 20px; padding: 20px;">
            <img src="${image_front_url || 'https://via.placeholder.com/150'}" style="width: 150px; height: 150px; object-fit: contain; margin-bottom: 15px;">
            <h1 style="font-size: 1.5rem; margin-bottom: 5px;">${product_name || 'Unknown'}</h1>
            <p class="subtitle">${brands || 'No Brand'}</p>
        </div>

        <div class="glass-panel" style="margin-bottom: 20px; border-left: 4px solid var(--neon-green);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                   <span class="label-small" style="color: var(--neon-green)">Nutri-Score</span>
                   <div style="font-size: 1.2rem; font-weight: 800;">Grade ${(nutrition_grades || 'Unknown').toUpperCase()}</div>
                </div>
                <div class="nutri-badge ${nutriClass}" style="width: 45px; height: 45px; font-size: 1.2rem;">${(nutrition_grades || '?').toUpperCase()}</div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
            <div class="glass-panel" style="border-top: 2px solid var(--success);">
                <span class="label-small">Pros</span>
                <ul style="font-size: 0.85rem; list-style: none; margin-top: 8px;">
                    ${insights.pros.map(p => `<li style="margin-bottom: 4px; color: var(--success);">✓ ${p}</li>`).join('')}
                </ul>
            </div>
            <div class="glass-panel" style="border-top: 2px solid var(--danger);">
                <span class="label-small">Cons</span>
                <ul style="font-size: 0.85rem; list-style: none; margin-top: 8px;">
                    ${insights.cons.map(c => `<li style="margin-bottom: 4px; color: var(--danger);">× ${c}</li>`).join('')}
                </ul>
            </div>
        </div>

        <div class="glass-panel" style="margin-bottom: 20px;">
            <span class="label-small">Allergy Check</span>
            <div style="margin-top: 10px;">
                <p style="font-weight: 600; font-size: 0.95rem;">${analysis.isSafe ? 'No issues found for your profile.' : '⚠️ Alert: ' + analysis.issues.join(', ')}</p>
                <p class="subtitle" style="margin-top: 5px; font-size: 0.8rem;">Contains: ${analysis.allergensFound.join(', ') || 'None'}</p>
            </div>
        </div>

        <div class="glass-panel">
            <span class="label-small">Description</span>
            <p style="font-size: 0.85rem; line-height: 1.5; color: var(--text-muted); margin-top: 10px;">
                ${generic_name || ingredients_text || 'No detailed information available.'}
            </p>
        </div>
    `;
    lucide.createIcons();
}

function getProductInsights(product) {
    const pros = []; const cons = [];
    const n = product.nutriments || {};
    if (n.proteins_100g > 10) pros.push("High Protein");
    if (n.fiber_100g > 5) pros.push("High Fiber");
    if (n.sugars_100g > 20) cons.push("High Sugar");
    if (product.additives_n > 5) cons.push("Additives");
    if (pros.length === 0) pros.push("Natural");
    if (cons.length === 0) cons.push("Safe Choice");
    return { pros: pros.slice(0, 3), cons: cons.slice(0, 3) };
}

function analyzeDietary(product) {
    const key = authManager.getDataKey('ha_profile');
    const userProfile = JSON.parse(localStorage.getItem(key)) || profile;
    const allergens = product.allergens_tags || [];
    const ingredients = (product.ingredients_text || '').toLowerCase();
    let issues = [];
    let allergensFound = allergens.map(a => a.replace('en:', '').replace('-', ' ').toUpperCase());

    if (userProfile.vegan && (allergens.includes('en:milk') || ingredients.includes('meat') || ingredients.includes('milk'))) issues.push('Non-Vegan');
    if (userProfile.gluten_free && (allergens.includes('en:gluten') || ingredients.includes('wheat'))) issues.push('Gluten');
    if (userProfile.nuts && (allergens.includes('en:nuts') || ingredients.includes('nut'))) issues.push('Nuts');

    return { isSafe: issues.length === 0, issues, allergensFound };
}

// History Handling
function saveToHistory(product) {
    const key = authManager.getDataKey('ha_history');
    let history = JSON.parse(localStorage.getItem(key) || '[]');
    history = history.filter(p => p.code !== product.code);
    history.unshift({
        code: product.code,
        name: product.product_name,
        brand: product.brands,
        image: product.image_front_url,
        score: product.nutrition_grades,
        fullData: product,
        time: 'Just now'
    });
    localStorage.setItem(key, JSON.stringify(history.slice(0, 20)));
    loadHistory();
}

function loadHistory() {
    const key = authManager.getDataKey('ha_history');
    const history = JSON.parse(localStorage.getItem(key) || '[]');

    // Horizontal List
    recentScansList.innerHTML = history.slice(0, 6).map(item => `
        <div class="product-card" onclick="fetchProduct('${item.code}')">
            <div class="card-img-container">
                <img src="${item.image || 'https://via.placeholder.com/100'}" class="card-img">
                <div class="nutri-badge nutri-${(item.score || 'e').toLowerCase()}">${(item.score || 'E').toUpperCase()}</div>
            </div>
            <div class="card-name">${item.name || 'Unknown'}</div>
            <div class="card-time">${item.time || 'Today'}</div>
        </div>
    `).join('') || '<p class="subtitle">No recent scans</p>';

    // Vertical List
    fullHistoryList.innerHTML = history.map(item => `
        <div class="glass-panel" style="display: flex; gap: 15px; cursor: pointer;" onclick="fetchProduct('${item.code}')">
             <div style="width: 50px; height: 50px; background: white; border-radius: 8px; overflow: hidden;">
                <img src="${item.image || 'https://via.placeholder.com/50'}" style="width:100%; height:100%; object-fit: contain;">
             </div>
             <div style="flex:1;">
                <div style="font-weight: 600;">${item.name || 'Unknown'}</div>
                <div class="subtitle">${item.brand || 'No Brand'}</div>
             </div>
             <div class="nutri-badge nutri-${(item.score || 'e').toLowerCase()}" style="width: 24px; height: 24px;">${(item.score || 'E').toUpperCase()}</div>
        </div>
    `).join('') || '<p class="subtitle" style="text-align: center;">History empty.</p>';

    lucide.createIcons();
}

function loadProfile() {
    const key = authManager.getDataKey('ha_profile');
    const saved = localStorage.getItem(key);
    if (saved) {
        profile = JSON.parse(saved);
        Object.keys(profile).forEach(k => {
            const check = document.getElementById(`pref-${k}`);
            if (check) check.checked = profile[k];
        });
    }
    lucide.createIcons();
}

function setupEventListeners() {
    // Mode Toggle
    const modeToggle = document.getElementById('mode-toggle');
    const toggleItems = modeToggle.querySelectorAll('.toggle-item');
    toggleItems.forEach(item => {
        item.addEventListener('click', () => {
            toggleItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            modeToggle.classList.toggle('text-mode', item.getAttribute('data-mode') === 'text');
        });
    });

    // Forms
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        authManager.login(e.target.elements[0].value, e.target.elements[1].value);
    });

    document.getElementById('register-form').addEventListener('submit', (e) => {
        e.preventDefault();
        authManager.register(e.target.elements[0].value, e.target.elements[1].value, e.target.elements[2].value);
    });

    // Profile Toggles
    ['vegan', 'gluten_free', 'nuts'].forEach(k => {
        const el = document.getElementById(`pref-${k}`);
        if (el) {
            el.addEventListener('change', (e) => {
                profile[k] = e.target.checked;
                const key = authManager.getDataKey('ha_profile');
                localStorage.setItem(key, JSON.stringify(profile));
                loadProfile();
            });
        }
    });

    manualSearchBtn.addEventListener('click', () => {
        const code = barcodeInput.value.trim();
        if (code) fetchProduct(code);
    });
}
