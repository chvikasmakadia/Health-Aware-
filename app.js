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
let currentMode = 'barcode'; // 'barcode' or 'text'
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
            if (currentMode === 'text') {
                performOCR();
            }
            return;
        }

        const config = { fps: 15, qrbox: { width: 250, height: 150 } };
        scanner.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
                if (currentMode === 'barcode') onScanSuccess(decodedText);
            },
            (err) => { }
        ).then(() => {
            console.log("Scanner started");
            if (currentMode === 'text') {
                // For OCR, we might need a button to "Capture" or just show a message
                // The scan button will trigger performOCR if already scanning
            }
        }).catch(err => {
            displayCameraError(err);
        });
    });
}

async function performOCR() {
    const video = document.querySelector('#scanner-container video');
    if (!video) return;

    // Show loading in details overlay or similar
    openProductDetails('Analyzing text...');

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    try {
        const { data: { text } } = await Tesseract.recognize(canvas, 'eng');
        console.log("OCR Result:", text);

        // Simple heuristic: search for the first few words as a product name
        const query = text.trim().split('\n')[0].substring(0, 50);
        if (query.length > 3) {
            manualSearch(query);
        } else {
            throw new Error("No clear text found");
        }
    } catch (err) {
        productDetailsContent.innerHTML = `
            <div class="glass-panel" style="text-align: center; padding: 40px 20px;">
                <i data-lucide="type-outline" size="48" style="color: var(--text-muted); margin-bottom: 20px;"></i>
                <h3>Could not read text</h3>
                <p class="subtitle">Try focusing more on the product name.</p>
                <button class="auth-btn" style="margin-top: 20px;" onclick="closeProductDetails()">Try Again</button>
            </div>
        `;
        lucide.createIcons();
    }
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

async function manualSearch(query) {
    if (!query) return;
    openProductDetails(`Searching for "${query}"...`);
    try {
        const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1`);
        const data = await response.json();

        if (data.products && data.products.length > 0) {
            const product = data.products[0];
            renderProduct(product);
            saveToHistory(product);
        } else {
            productDetailsContent.innerHTML = `
                <div class="glass-panel" style="text-align: center; padding: 40px 20px;">
                    <i data-lucide="search-x" size="48" style="color: var(--text-muted); margin-bottom: 20px;"></i>
                    <h3>No products found</h3>
                    <p class="subtitle">Search query: "${query}"</p>
                    <p class="subtitle" style="margin-top:10px;">Try focusing on the brand or product name directly.</p>
                </div>
            `;
            lucide.createIcons();
        }
    } catch (err) {
        productDetailsContent.innerHTML = `<div class="glass-panel" style="text-align: center; color: var(--danger); padding: 40px 20px;">Search failed. Check connection.</div>`;
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
        ingredients_text,
        generic_name,
        quantity
    } = product;

    const analysis = analyzeDietary(product);
    const insights = getProductInsights(product);

    productDetailsContent.innerHTML = `
        <div class="detail-box">
            <div class="box-header">
                <i data-lucide="package" size="18" style="color:var(--neon-green)"></i>
                <span class="box-title">Product Scanned</span>
            </div>
            <div class="detail-img-container">
                <img src="${image_front_url || 'https://via.placeholder.com/150'}" class="detail-img">
            </div>
            <div style="text-align: center;">
                <h2 style="font-size: 1.4rem; margin-bottom: 5px;">${product_name || 'Unknown Product'}</h2>
                <p class="subtitle">${brands || 'Brand Unknown'} ${quantity ? '• ' + quantity : ''}</p>
            </div>
        </div>

        <div class="detail-box">
            <div class="box-header">
                <i data-lucide="file-text" size="18" style="color:var(--neon-green)"></i>
                <span class="box-title">Description</span>
            </div>
            <div class="box-content">
                ${generic_name || ingredients_text || 'No detailed description available for this product.'}
            </div>
        </div>

        <div class="pros-cons-grid">
            <div class="detail-box pro">
                <div class="box-header">
                    <i data-lucide="check-circle" size="18" style="color:var(--success)"></i>
                    <span class="box-title">Pros</span>
                </div>
                <div class="box-content" style="font-size: 0.85rem; color: var(--success);">
                    ${insights.pros.map(p => `<div>• ${p}</div>`).join('')}
                </div>
            </div>
            <div class="detail-box con">
                <div class="box-header">
                    <i data-lucide="x-circle" size="18" style="color:#ff6666"></i>
                    <span class="box-title danger">Cons</span>
                </div>
                <div class="box-content" style="font-size: 0.85rem; color: #ff6666;">
                    ${insights.cons.map(c => `<div>• ${c}</div>`).join('')}
                </div>
            </div>
        </div>

        <div class="detail-box ${analysis.isSafe ? '' : 'alert'}">
            <div class="box-header">
                <i data-lucide="${analysis.isSafe ? 'shield-check' : 'alert-triangle'}" size="18" style="color:${analysis.isSafe ? 'var(--neon-green)' : 'var(--warning)'}"></i>
                <span class="box-title ${analysis.isSafe ? '' : 'warning'}">Allergy Alert</span>
            </div>
            <div class="box-content">
                <p style="font-weight: 600;">${analysis.isSafe ? 'Safe for your profile.' : '⚠️ ' + analysis.issues.join(', ')}</p>
                <p class="subtitle" style="margin-top: 5px; font-size: 0.8rem;">
                    Contains: ${analysis.allergensFound.length > 0 ? analysis.allergensFound.join(', ') : 'No common allergens detected.'}
                </p>
            </div>
        </div>

        <div class="detail-box">
            <div class="box-header">
                <i data-lucide="users" size="18" style="color:var(--neon-green)"></i>
                <span class="box-title">Target Group</span>
            </div>
            <div class="box-content">
                <p style="font-weight: 500;">Best for: Adults & Health-conscious users</p>
                <p class="subtitle" style="font-size: 0.8rem;">Avoid if: You have specific allergies mentioned above.</p>
            </div>
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
            currentMode = item.getAttribute('data-mode');
            modeToggle.classList.toggle('text-mode', currentMode === 'text');

            // Stop scanner if running to reset UI for new mode
            if (scanner && scanner.getState() === 2) {
                scanner.stop();
            }
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
