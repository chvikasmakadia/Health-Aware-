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
        // Mock authentication
        this.user = { id: Date.now(), email, name: email.split('@')[0], status: 'Premium' };
        localStorage.setItem('ha_user', JSON.stringify(this.user));
        this.updateUI();
        window.closeAuthModal();
        loadProfile();
        loadHistory();
    }

    register(name, email, password) {
        // Mock registration
        this.user = { id: Date.now(), email, name, status: 'Premium' };
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
        showSection('scanner-section');
    }

    updateUI() {
        const guestView = document.getElementById('guest-profile');
        const userView = document.getElementById('user-profile');

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
const navItems = document.querySelectorAll('.nav-item');
const startScannerBtn = document.getElementById('start-scanner-btn');
const barcodeInput = document.getElementById('barcode-input');
const manualSearchBtn = document.getElementById('manual-search-btn');
const productContent = document.getElementById('product-content');
const historyList = document.getElementById('history-list');

// State
let profile = {
    vegan: false,
    vegetarian: false,
    gluten_free: false,
    nuts: false,
    dairy: false
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadProfile();
    loadHistory();
    setupNavigation();
    setupScanner();
    setupEventListeners();
    registerServiceWorker();
});

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then(() => {
            console.log('Service Worker Registered');
        });
    }
}

// Navigation Logic
function setupNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            showSection(target);

            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
        });
    });

    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showSection('scanner-section');
            navItems[0].click();
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
    scanner = new Html5Qrcode("scanner-container");

    startScannerBtn.addEventListener('click', () => {
        const config = { fps: 10, qrbox: { width: 250, height: 150 } };

        scanner.start(
            { facingMode: "environment" },
            config,
            onScanSuccess,
            onScanError
        ).then(() => {
            startScannerBtn.style.display = 'none';
        }).catch(err => {
            alert("Camera access failed: " + err);
        });
    });
}

function onScanSuccess(decodedText) {
    scanner.stop();
    startScannerBtn.style.display = 'block';
    fetchProduct(decodedText);
}

function onScanError(err) {
    // Silent fail for continuous scanning
}

// API & Data Fetching
async function fetchProduct(barcode) {
    showSection('product-section');
    productContent.innerHTML = '<div class="glass-panel" style="text-align: center;">Searching for product...</div>';

    // Check Local History first (Offline support)
    const history = JSON.parse(localStorage.getItem('ha_history') || '[]');
    const cached = history.find(p => p.code === barcode);

    // If offline, try to show cached data even if it's partial, or use it as a fallback
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
            productContent.innerHTML = `
                <div class="glass-panel" style="text-align: center;">
                    <h3>Product Not Found</h3>
                    <p class="subtitle">Barcode: ${barcode}</p>
                </div>
            `;
        }
    } catch (err) {
        if (cached && cached.fullData) {
            renderProduct(cached.fullData);
        } else {
            productContent.innerHTML = `<div class="glass-panel" style="text-align: center; color: var(--danger);">Network Error. Please check your connection.</div>`;
        }
    }
}

// UI Rendering
function renderProduct(product) {
    const {
        product_name,
        brands,
        image_front_url,
        nutrition_grades,
        ecoscore_grade,
        ingredients_text,
        additives_tags,
        nutriscore_data,
        generic_name
    } = product;

    const nutriClass = `score-${(nutrition_grades || 'e').toLowerCase()}`;
    const ecoClass = `score-${(ecoscore_grade || 'e').toLowerCase()}`;

    const analysis = analyzeDietary(product);
    const insights = getProductInsights(product);

    productContent.innerHTML = `
        <div class="product-hero glass-panel">
            <span class="label-small">Product Scanned</span>
            <h1 class="product-name" style="margin-bottom: 5px;">${product_name || 'Unknown Product'}</h1>
            <p class="subtitle">${brands || 'No Brand'}</p>
        </div>

        <div class="feature-block plain-block">
            <div class="feature-header">
                <i data-lucide="file-text" size="16"></i>
                <span>Description</span>
            </div>
            <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
                ${generic_name || ingredients_text ? (generic_name || ingredients_text).substring(0, 150) + '...' : 'No description available for this product.'}
            </p>
        </div>

        <div class="analysis-grid">
            <div class="feature-block pros-block">
                <div class="feature-header">
                    <i data-lucide="check" size="14"></i>
                    <span>Pros</span>
                </div>
                <ul class="feature-list">
                    ${insights.pros.map(p => `<li>${p}</li>`).join('')}
                </ul>
            </div>
            <div class="feature-block cons-block">
                <div class="feature-header">
                    <i data-lucide="x" size="14"></i>
                    <span>Cons</span>
                </div>
                <ul class="feature-list">
                    ${insights.cons.map(c => `<li>${c}</li>`).join('')}
                </ul>
            </div>
        </div>

        <div class="feature-block alert-redesigned">
            <div class="feature-header">
                <i data-lucide="alert-triangle" size="16"></i>
                <span>Allergy Alert</span>
            </div>
            <div style="font-size: 0.9rem; margin-top: 5px;">
                <strong>Contains: ${analysis.allergensFound.length > 0 ? analysis.allergensFound.join(', ') : 'None detected'}</strong>
                ${!analysis.isSafe ? `<p style="margin-top: 5px; opacity: 0.8; font-size: 0.8rem;">⚠️ Matches your restrictions: ${analysis.issues.join(', ')}</p>` : ''}
            </div>
        </div>

        <div class="feature-block plain-block">
            <div class="feature-header" style="color: #a78bfa;">
                <i data-lucide="users" size="16"></i>
                <span>Target Group</span>
            </div>
            <div class="target-group-info">
                <div class="target-item">
                    <i data-lucide="user-check" size="14"></i>
                    <span>Best for: ${insights.targetGroup.best}</span>
                </div>
                <div class="target-item">
                    <i data-lucide="user-x" size="14"></i>
                    <span>Avoid if: ${insights.targetGroup.avoid}</span>
                </div>
            </div>
        </div>

        <div class="glass-panel" style="margin-top: 10px;">
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Nutri-Score</span>
                    <span class="score-badge ${nutriClass}">${(nutrition_grades || 'Unknown').toUpperCase()}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Eco-Score</span>
                    <span class="score-badge ${ecoClass}">${(ecoscore_grade || 'Unknown').toUpperCase()}</span>
                </div>
            </div>
        </div>
    `;
    lucide.createIcons();
}

function getProductInsights(product) {
    const pros = [];
    const cons = [];
    const nutriments = product.nutriments || {};

    // Derived Pros
    if (nutriments.proteins_100g > 10) pros.push("High Protein");
    if (nutriments.fiber_100g > 5) pros.push("High Fiber");
    if (product.labels_tags && !product.labels_tags.includes('en:palm-oil')) pros.push("No Palm Oil");
    if (nutriments.sodium_100g < 0.1) pros.push("Low Sodium");
    if (pros.length === 0) pros.push("Standard Ingredients");

    // Derived Cons
    if (nutriments.sugars_100g > 20) cons.push("High Sugar");
    if (product.additives_n > 5) cons.push("Preservatives");
    if (product.additives_tags && product.additives_tags.some(t => t.includes('color'))) cons.push("Artificial Color");
    if (nutriments['saturated-fat_100g'] > 5) cons.push("High Saturated Fat");
    if (cons.length === 0) cons.push("No Major Concerns");

    // Target Group Logic
    let best = "General Population";
    let avoid = "None";

    if (nutriments.proteins_100g > 15) best = "Athletes & Active Adults";
    if (nutriments.sugars_100g > 25) avoid = "Children & Diabetics";
    if (product.allergens_tags && product.allergens_tags.length > 3) avoid = "Highly Sensitive Individuals";

    return {
        pros: pros.slice(0, 3),
        cons: cons.slice(0, 3),
        targetGroup: { best, avoid }
    };
}

function renderAdditives(tags) {
    if (!tags || tags.length === 0) return '<p class="subtitle">No additives identified.</p>';
    return tags.map(tag => {
        const name = tag.replace('en:', '').replace('-', ' ').toUpperCase();
        return `<span class="score-badge" style="background: rgba(255,255,255,0.1); margin: 0 5px 5px 0;">${name}</span>`;
    }).join('');
}

// Logic: Dietary Analysis
function analyzeDietary(product) {
    const key = authManager.getDataKey('ha_profile');
    const userProfile = JSON.parse(localStorage.getItem(key)) || profile;

    const allergens = product.allergens_tags || [];
    const ingredients = (product.ingredients_text || '').toLowerCase();

    let issues = [];
    let allergensFound = allergens.map(a => a.replace('en:', '').replace('-', ' ').toUpperCase());

    if (userProfile.vegan && (allergens.includes('en:milk') || allergens.includes('en:eggs') || ingredients.includes('meat') || ingredients.includes('milk'))) {
        issues.push('Non-Vegan');
    }
    if (userProfile.vegetarian && (ingredients.includes('meat') || ingredients.includes('fish'))) {
        issues.push('Non-Vegetarian');
    }
    if (userProfile.gluten_free && (allergens.includes('en:gluten') || ingredients.includes('wheat') || ingredients.includes('barley'))) {
        issues.push('Gluten');
    }
    if (userProfile.nuts && (allergens.includes('en:nuts') || allergens.includes('en:peanuts') || ingredients.includes('nut'))) {
        issues.push('Nuts');
    }
    if (userProfile.dairy && (allergens.includes('en:milk') || ingredients.includes('milk') || ingredients.includes('dairy'))) {
        issues.push('Dairy');
    }

    return {
        isSafe: issues.length === 0,
        issues: issues,
        allergensFound: allergensFound,
        message: issues.length === 0 ? 'Matches your preferences.' : issues.join(', ')
    };
}

// Persistance: Profile
function loadProfile() {
    const key = authManager.getDataKey('ha_profile');
    const saved = localStorage.getItem(key);
    if (saved) {
        profile = JSON.parse(saved);
        Object.keys(profile).forEach(key => {
            const check = document.getElementById(`pref-${key}`);
            if (check) check.checked = profile[key];
        });
    } else {
        // Reset toggles if no profile found (e.g. after logout)
        Object.keys(profile).forEach(key => {
            profile[key] = false;
            const check = document.getElementById(`pref-${key}`);
            if (check) check.checked = false;
        });
    }
}

function setupEventListeners() {
    // Auth Forms
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = e.target.elements[0].value;
        const pass = e.target.elements[1].value;
        authManager.login(email, pass);
    });

    document.getElementById('register-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = e.target.elements[0].value;
        const email = e.target.elements[1].value;
        const pass = e.target.elements[2].value;
        authManager.register(name, email, pass);
    });

    // Profile Toggles
    Object.keys(profile).forEach(key => {
        const check = document.getElementById(`pref-${key}`);
        if (check) {
            check.addEventListener('change', (e) => {
                profile[key] = e.target.checked;
                const dataKey = authManager.getDataKey('ha_profile');
                localStorage.setItem(dataKey, JSON.stringify(profile));
            });
        }
    });

    // Manual Search
    manualSearchBtn.addEventListener('click', () => {
        const code = barcodeInput.value.trim();
        if (code) fetchProduct(code);
    });

    barcodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') manualSearchBtn.click();
    });
}

// Persistance: History
function saveToHistory(product) {
    const key = authManager.getDataKey('ha_history');
    let history = JSON.parse(localStorage.getItem(key) || '[]');
    // Avoid duplicates
    history = history.filter(p => p.code !== product.code);
    history.unshift({
        code: product.code,
        name: product.product_name,
        brand: product.brands,
        image: product.image_front_url,
        fullData: product // Save full data for offline viewing
    });
    // Keep last 20
    history = history.slice(0, 20);
    localStorage.setItem(key, JSON.stringify(history));
    loadHistory();
}

function loadHistory() {
    const key = authManager.getDataKey('ha_history');
    const history = JSON.parse(localStorage.getItem(key) || '[]');
    if (history.length === 0) {
        historyList.innerHTML = '<p class="subtitle" style="text-align: center; margin-top: 20px;">No recent scans.</p>';
        return;
    }

    historyList.innerHTML = history.map(item => `
        <div class="glass-panel" style="display: flex; align-items: center; gap: 15px; cursor: pointer;" onclick="fetchProduct('${item.code}')">
            <img src="${item.image || 'https://via.placeholder.com/50'}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;">
            <div style="flex: 1;">
                <div style="font-weight: 600;">${item.name || 'Unknown'}</div>
                <div class="subtitle">${item.brand || 'No brand'}</div>
            </div>
            <i data-lucide="chevron-right" style="color: var(--text-muted);"></i>
        </div>
    `).join('');
    lucide.createIcons();
}
