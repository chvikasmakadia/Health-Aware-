// Smart Ingredient Scanner Core Logic

const API_BASE = 'https://world.openfoodfacts.org/api/v2/product/';
let scanner = null;

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
        allergens_tags
    } = product;

    const nutriClass = `score-${(nutrition_grades || 'e').toLowerCase()}`;
    const ecoClass = `score-${(ecoscore_grade || 'e').toLowerCase()}`;

    const analysis = analyzeDietary(product);

    productContent.innerHTML = `
        <div class="glass-panel">
            <img src="${image_front_url || 'https://via.placeholder.com/200'}" style="width: 100%; height: 150px; object-fit: contain; border-radius: 10px; margin-bottom: 15px;">
            <h1 class="product-name">${product_name || 'Unknown Product'}</h1>
            <p class="subtitle" style="margin-bottom: 20px;">${brands || 'No Brand'}</p>

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

            <div class="alert-box ${analysis.isSafe ? 'alert-success' : 'alert-danger'}">
                <i data-lucide="${analysis.isSafe ? 'check-circle' : 'alert-triangle'}"></i>
                <div>
                    <strong style="display: block;">${analysis.isSafe ? 'Safe for you!' : 'Allergen Warning'}</strong>
                    <span style="font-size: 0.85rem;">${analysis.message}</span>
                </div>
            </div>
        </div>

        <div class="glass-panel">
            <h3 style="margin-bottom: 15px;">Additives Analysis</h3>
            <div id="additives-list">
                ${renderAdditives(additives_tags)}
            </div>
        </div>

        <div class="glass-panel">
            <h3 style="margin-bottom: 15px;">Ingredients</h3>
            <p style="font-size: 0.9rem; line-height: 1.5; color: var(--text-muted);">
                ${ingredients_text || 'Ingredients list not available.'}
            </p>
        </div>
    `;
    lucide.createIcons();
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
    const allergens = product.allergens_tags || [];
    const ingredients = (product.ingredients_text || '').toLowerCase();

    let issues = [];

    if (profile.vegan && (allergens.includes('en:milk') || allergens.includes('en:eggs') || ingredients.includes('meat') || ingredients.includes('milk'))) {
        issues.push('Non-Vegan ingredients detected');
    }
    if (profile.vegetarian && (ingredients.includes('meat') || ingredients.includes('fish'))) {
        issues.push('Non-Vegetarian ingredients detected');
    }
    if (profile.gluten_free && (allergens.includes('en:gluten') || ingredients.includes('wheat') || ingredients.includes('barley'))) {
        issues.push('Gluten detected');
    }
    if (profile.nuts && (allergens.includes('en:nuts') || allergens.includes('en:peanuts') || ingredients.includes('nut'))) {
        issues.push('Nuts detected');
    }
    if (profile.dairy && (allergens.includes('en:milk') || ingredients.includes('milk') || ingredients.includes('dairy'))) {
        issues.push('Dairy detected');
    }

    return {
        isSafe: issues.length === 0,
        message: issues.length === 0 ? 'Matches your profile preferences.' : issues.join(', ')
    };
}

// Persistance: Profile
function loadProfile() {
    const saved = localStorage.getItem('ha_profile');
    if (saved) {
        profile = JSON.parse(saved);
        Object.keys(profile).forEach(key => {
            const check = document.getElementById(`pref-${key}`);
            if (check) check.checked = profile[key];
        });
    }
}

function setupEventListeners() {
    // Profile Toggles
    Object.keys(profile).forEach(key => {
        const check = document.getElementById(`pref-${key}`);
        if (check) {
            check.addEventListener('change', (e) => {
                profile[key] = e.target.checked;
                localStorage.setItem('ha_profile', JSON.stringify(profile));
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
    let history = JSON.parse(localStorage.getItem('ha_history') || '[]');
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
    localStorage.setItem('ha_history', JSON.stringify(history));
    loadHistory();
}

function loadHistory() {
    const history = JSON.parse(localStorage.getItem('ha_history') || '[]');
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
