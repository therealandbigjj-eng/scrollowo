const API_BASE = 'https://e621.net/posts.json';
const BATCH_SIZE = 10;
const LIKE_STORAGE_KEY = 'e621_liked_posts';
const DISLIKE_STORAGE_KEY = 'e621_disliked_posts';
const TAGS_STORAGE_KEY = 'e621_active_tags';
const CURATED_TAGS_STORAGE_KEY = 'e621_curated_tags';
const TOP_ARTISTS_STORAGE_KEY = 'e621_top_artists';
const SETTINGS_STORAGE_KEY = 'e621_settings';

let images = [];
let currentIndex = 0;
let activeTags = [];
let curatedTags = [];
let topArtists = {};
let likedPosts = new Set();
let dislikedPosts = new Set();
let isLoading = false;
let hasMorePages = true;
let pageNumber = 1;
let autoScrollTimer = null;
let settings = {
    autoSuggest: true,
    curateFromLikes: true,
    particles: true,
    autoPlay: true,
    autoScroll: false,
    autoScrollInterval: 5,
    trackArtists: true,
    rainbowMode: false,
    theme: 'dark'
};

const popularTags = [
    'cat', 'dog', 'wolf', 'fox', 'dragon', 'furry', 'anthro', 'cute',
    'comic', 'artwork', 'sketch', 'animation', 'digital', 'traditional',
    'character', 'oc', 'original character', 'nsfw', 'safe', 'questionable'
];

const particles = ['✨', '💬', '⭐', '💥', '🌟'];

// Initialize
function init() {
    loadSettings();
    applyTheme();
    initLikedPosts();
    initDislikedPosts();
    loadActiveTags();
    loadCuratedTags();
    loadTopArtists();
    setupEventListeners();
    updateStats();
    renderTags();
    renderCuratedTags();
    updateSettingsUI();
    renderSuggestedTags();
    fetchImages();
}

// Theme Management
function applyTheme() {
    const root = document.documentElement;
    switch(settings.theme) {
        case 'darkpurple':
            root.style.setProperty('--primary-color', '#a855f7');
            break;
        case 'midnight':
            root.style.setProperty('--primary-color', '#3b82f6');
            break;
        default:
            root.style.setProperty('--primary-color', '#0ea5e9');
    }
    
    if (settings.rainbowMode) {
        document.body.style.background = 'linear-gradient(45deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)';
        document.body.style.backgroundSize = '200% 200%';
        document.body.style.animation = 'gradientShift 8s ease infinite';
    } else {
        document.body.style.background = '#000';
        document.body.style.animation = 'none';
    }
}

// Settings Management
function loadSettings() {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
        settings = JSON.parse(stored);
    }
}

function saveSettings() {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    applyTheme();
}

function updateSettingsUI() {
    document.getElementById('autoSuggestToggle').checked = settings.autoSuggest;
    document.getElementById('curateFromLikesToggle').checked = settings.curateFromLikes;
    document.getElementById('particlesToggle').checked = settings.particles;
    document.getElementById('autoPlayToggle').checked = settings.autoPlay;
    document.getElementById('autoScrollToggle').checked = settings.autoScroll;
    document.getElementById('autoScrollInterval').value = settings.autoScrollInterval;
    document.getElementById('trackArtistsToggle').checked = settings.trackArtists;
    document.getElementById('rainbowModeToggle').checked = settings.rainbowMode;
    document.getElementById('themeSelect').value = settings.theme;
}

// Liked Posts Management
function initLikedPosts() {
    const stored = localStorage.getItem(LIKE_STORAGE_KEY);
    if (stored) {
        likedPosts = new Set(JSON.parse(stored));
    }
    updateLikedCount();
}

function saveLikedPosts() {
    localStorage.setItem(LIKE_STORAGE_KEY, JSON.stringify(Array.from(likedPosts)));
}

// Disliked Posts Management
function initDislikedPosts() {
    const stored = localStorage.getItem(DISLIKE_STORAGE_KEY);
    if (stored) {
        dislikedPosts = new Set(JSON.parse(stored));
    }
    updateDislikedCount();
}

function saveDislikedPosts() {
    localStorage.setItem(DISLIKE_STORAGE_KEY, JSON.stringify(Array.from(dislikedPosts)));
}

// Top Artists Management
function loadTopArtists() {
    const stored = localStorage.getItem(TOP_ARTISTS_STORAGE_KEY);
    if (stored) {
        topArtists = JSON.parse(stored);
    }
}

function saveTopArtists() {
    localStorage.setItem(TOP_ARTISTS_STORAGE_KEY, JSON.stringify(topArtists));
}

function updateArtistStats(post) {
    if (!settings.trackArtists) return;
    
    const artistTags = post.tags?.artist || [];
    artistTags.forEach(artist => {
        topArtists[artist] = (topArtists[artist] || 0) + 1;
    });
    
    saveTopArtists();
    renderCuratedTags();
}

// Tags Management
function loadActiveTags() {
    const stored = localStorage.getItem(TAGS_STORAGE_KEY);
    if (stored) {
        activeTags = JSON.parse(stored);
    }
}

function saveActiveTags() {
    localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(activeTags));
}

function loadCuratedTags() {
    const stored = localStorage.getItem(CURATED_TAGS_STORAGE_KEY);
    if (stored) {
        curatedTags = JSON.parse(stored);
    }
}

function saveCuratedTags() {
    localStorage.setItem(CURATED_TAGS_STORAGE_KEY, JSON.stringify(curatedTags));
}

// Auto-scroll
function startAutoScroll() {
    if (autoScrollTimer) clearInterval(autoScrollTimer);
    if (!settings.autoScroll) return;
    
    document.getElementById('autoScrollStatus').style.display = 'block';
    autoScrollTimer = setInterval(() => {
        nextImage();
    }, settings.autoScrollInterval * 1000);
}

function stopAutoScroll() {
    if (autoScrollTimer) {
        clearInterval(autoScrollTimer);
        autoScrollTimer = null;
    }
    document.getElementById('autoScrollStatus').style.display = 'none';
}

// Curate tags from liked posts
function updateCuratedTags() {
    if (!settings.autoSuggest || likedPosts.size === 0) return;

    const tagFrequency = {};
    let count = 0;

    for (const postId of likedPosts) {
        const post = images.find(p => p.id === postId);
        if (post && post.tags) {
            const allTags = [
                ...(post.tags.general || []),
                ...(post.tags.character || []),
                ...(post.tags.species || [])
            ];

            allTags.forEach(tag => {
                tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
            });
        }
        count++;
        if (count >= 50) break;
    }

    curatedTags = Object.entries(tagFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([tag]) => tag);

    saveCuratedTags();
    renderCuratedTags();
}

// Particle effects
function createParticle(x, y, emoji) {
    if (!settings.particles) return;
    
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.textContent = emoji;
    particle.style.left = x + 'px';
    particle.style.top = y + 'px';
    particle.style.setProperty('--tx', (Math.random() - 0.5) * 100 + 'px');
    
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 1500);
}

// Progress bar
function showProgressBar() {
    const bar = document.getElementById('progressBar');
    bar.classList.add('active');
}

function hideProgressBar() {
    const bar = document.getElementById('progressBar');
    bar.classList.remove('active');
    bar.style.width = '100%';
    setTimeout(() => {
        bar.style.width = '0%';
    }, 500);
}

// Fetch images from e621
async function fetchImages() {
    if (isLoading || !hasMorePages) return;

    isLoading = true;
    if (images.length === 0) {
        showLoading();
    }
    showProgressBar();

    try {
        const tags = activeTags.join(' ');
        const params = new URLSearchParams({
            tags: tags,
            limit: BATCH_SIZE,
            page: pageNumber,
        });

        const response = await fetch(`${API_BASE}?${params}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        if (!data.posts || data.posts.length === 0) {
            hasMorePages = false;
            if (images.length === 0) {
                showMessage('No images found. Try adding tags!');
            }
            isLoading = false;
            hideProgressBar();
            return;
        }

        const validPosts = data.posts.filter(post => post.file && post.file.url);
        images.push(...validPosts);

        pageNumber++;
        if (validPosts.length < BATCH_SIZE) {
            hasMorePages = false;
        }

        updateStats();
        if (currentIndex === 0) {
            renderImage();
        }
        hideLoading();
        hideProgressBar();
    } catch (error) {
        console.error('Error fetching images:', error);
        if (images.length === 0) {
            showMessage(`Error: ${error.message}<br><br>Make sure you have added tags first!`);
        }
        hideLoading();
        hideProgressBar();
    }

    isLoading = false;
}

// UI Functions
function showLoading() {
    const stack = document.getElementById('imageStack');
    if (stack.children.length === 0) {
        stack.innerHTML = '<div class="loading"><div class="spinner"></div><div>Loading...</div></div>';
    }
}

function hideLoading() {
    const stack = document.getElementById('imageStack');
    if (stack.querySelector('.loading')) {
        stack.innerHTML = '';
    }
}

function showMessage(msg) {
    const stack = document.getElementById('imageStack');
    stack.innerHTML = `<div class="loading" style="font-size: 18px; color: #ccc;">${msg}</div>`;
}

function renderImage() {
    const stack = document.getElementById('imageStack');

    if (images.length === 0) {
        showMessage('No images loaded. Add tags to get started!');
        return;
    }

    if (currentIndex >= images.length) {
        if (hasMorePages && !isLoading) {
            fetchImages();
        }
        return;
    }

    const post = images[currentIndex];
    const container = document.createElement('div');
    container.className = 'image-container';

    const wrapper = document.createElement('div');
    wrapper.className = 'image-wrapper';

    // Check if it's a video or image
    const isVideo = post.file.ext === 'webm' || post.file.ext === 'mp4' || post.file.ext === 'gif';
    let media;

    if (isVideo) {
        media = document.createElement('video');
        media.src = post.file.url;
        media.autoplay = settings.autoPlay;
        media.loop = true;
        media.controls = true;
        media.volume = 0.5;
        
        // Badge
        const badge = document.createElement('div');
        badge.className = 'media-badge';
        badge.textContent = '🎬 Video';
        wrapper.appendChild(badge);
    } else {
        media = document.createElement('img');
        media.src = post.file.url;
        media.alt = 'e621 image';
    }

    media.onerror = () => {
        nextImage();
    };

    const info = document.createElement('div');
    info.className = 'image-info';
    
    const desc = document.createElement('div');
    desc.className = 'image-description';
    desc.textContent = `Post #${post.id}`;

    // Artist info
    const artistTags = post.tags?.artist || [];
    if (artistTags.length > 0) {
        const artistDiv = document.createElement('div');
        artistDiv.className = 'image-artist';
        artistDiv.textContent = `by ${artistTags.join(', ')}`;
        info.appendChild(artistDiv);
    }
    info.appendChild(desc);

    const tags = document.createElement('div');
    tags.className = 'image-tags';
    const allTags = [
        ...(post.tags.general || []),
        ...(post.tags.character || []),
        ...(post.tags.species || [])
    ];
    tags.innerHTML = allTags.slice(0, 20).map(tag => `<div class="image-tag" onclick="window.app.addTag('${tag}')">${tag}</div>`).join('');

    info.appendChild(tags);
    
    info.addEventListener('click', (e) => {
        if (e.target.classList.contains('image-tag')) return;
        info.classList.toggle('expanded');
    });

    wrapper.appendChild(media);
    container.appendChild(wrapper);
    container.appendChild(info);
    stack.innerHTML = '';
    stack.appendChild(container);

    updateLikeButton();
    updateStats();
    updateArtistStats(post);

    // Prefetch next image
    if (currentIndex > images.length - 3 && hasMorePages && !isLoading) {
        fetchImages();
    }
}

function nextImage() {
    const current = document.querySelector('.image-container');
    if (current) {
        current.classList.add('exiting');
        setTimeout(() => {
            if (currentIndex < images.length - 1) {
                currentIndex++;
                renderImage();
            } else if (hasMorePages && !isLoading) {
                fetchImages();
            }
        }, 300);
    }
}

function prevImage() {
    if (currentIndex > 0) {
        currentIndex--;
        renderImage();
    }
}

function updateLikeButton() {
    const likeBtn = document.getElementById('likeBtn');
    const dislikeBtn = document.getElementById('dislikeBtn');
    const postId = images[currentIndex]?.id;

    if (likedPosts.has(postId)) {
        likeBtn.classList.add('liked');
        likeBtn.textContent = '❤';
    } else {
        likeBtn.classList.remove('liked');
        likeBtn.textContent = '♡';
    }

    if (dislikedPosts.has(postId)) {
        dislikeBtn.classList.add('disliked');
        dislikeBtn.textContent = '👎';
    } else {
        dislikeBtn.classList.remove('disliked');
        dislikeBtn.textContent = '👎';
    }
}

function toggleLike() {
    if (images.length === 0) return;
    const postId = images[currentIndex].id;
    const likeBtn = document.getElementById('likeBtn');
    
    if (likedPosts.has(postId)) {
        likedPosts.delete(postId);
    } else {
        likedPosts.add(postId);
        dislikedPosts.delete(postId);
        createParticle(likeBtn.offsetLeft + 25, likeBtn.offsetTop + 25, '❤');
    }
    saveLikedPosts();
    updateLikeButton();
    updateLikedCount();
    updateCuratedTags();
}

function toggleDislike() {
    if (images.length === 0) return;
    const postId = images[currentIndex].id;
    const dislikeBtn = document.getElementById('dislikeBtn');
    
    if (dislikedPosts.has(postId)) {
        dislikedPosts.delete(postId);
    } else {
        dislikedPosts.add(postId);
        likedPosts.delete(postId);
        createParticle(dislikeBtn.offsetLeft + 25, dislikeBtn.offsetTop + 25, '💬');
    }
    saveDislikedPosts();
    updateLikeButton();
    updateDislikedCount();
}

function updateLikedCount() {
    document.getElementById('likedCount').textContent = likedPosts.size + ' liked';
}

function updateDislikedCount() {
    document.getElementById('dislikedCount').textContent = dislikedPosts.size + ' disliked';
}

function updateStats() {
    document.getElementById('imageCount').textContent = `${currentIndex + 1} / ${images.length}`;
    document.getElementById('totalImages').textContent = images.length;
    document.getElementById('currentIndex').textContent = currentIndex + 1;
}

function addTag(tag) {
    tag = tag.trim().toLowerCase();

    if (!tag) return;
    if (activeTags.includes(tag)) return;
    if (activeTags.length >= 10) {
        alert('Maximum 10 tags allowed');
        return;
    }

    activeTags.push(tag);
    saveActiveTags();
    renderTags();
    resetFeed();
    fetchImages();
    closeSidebar();
    closeSearch();
}

function removeTag(tag) {
    activeTags = activeTags.filter(t => t !== tag);
    saveActiveTags();
    renderTags();
    resetFeed();
    if (activeTags.length > 0) {
        fetchImages();
    }
}

function renderTags() {
    const container = document.getElementById('activeTags');
    container.innerHTML = activeTags.map(tag => `
        <div class="tag">
            ${tag}
            <button class="tag-remove" onclick="window.app.removeTag('${tag}')">×</button>
        </div>
    `).join('');
}

function renderCuratedTags() {
    const container = document.getElementById('curatedTags');
    if (curatedTags.length === 0) {
        container.innerHTML = '<div style="font-size: 12px; color: #666;">Like more images to see curated tags</div>';
    } else {
        container.innerHTML = curatedTags.map(tag => `
            <div class="tag" style="cursor: pointer;" onclick="window.app.addTagFromCurated('${tag}')">
                ${tag}
                <span style="margin-left: 4px;">+</span>
            </div>
        `).join('');
    }

    // Render top artists
    const artistContainer = document.getElementById('topArtists');
    const sortedArtists = Object.entries(topArtists)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([artist]) => artist);
    
    if (sortedArtists.length === 0) {
        artistContainer.innerHTML = '<div style="font-size: 12px; color: #666;">Like images to discover artists</div>';
    } else {
        artistContainer.innerHTML = sortedArtists.map(artist => `
            <div class="tag" style="cursor: pointer;" onclick="window.app.addTag('${artist}')">
                ${artist}
                <span style="margin-left: 4px;">🎨</span>
            </div>
        `).join('');
    }
}

function renderSuggestedTags() {
    const container = document.getElementById('suggestedTags');
    container.innerHTML = popularTags.map(tag => `
        <div class="suggested-tag" onclick="window.app.addTag('${tag}')">${tag}</div>
    `).join('');
}

function resetFeed() {
    images = [];
    currentIndex = 0;
    pageNumber = 1;
    hasMorePages = true;
    updateStats();
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('visible');
}

function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('visible');
}

function closeSearch() {
    document.getElementById('searchModal').classList.remove('active');
    document.getElementById('tagSearchInput').value = '';
}

function openSearch() {
    document.getElementById('searchModal').classList.add('active');
    document.getElementById('tagSearchInput').focus();
}

// Event Listeners
function setupEventListeners() {
    // Menu
    document.getElementById('menuBtn').addEventListener('click', openSidebar);
    document.getElementById('closeSidebarBtn').addEventListener('click', closeSidebar);
    document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);

    // Search
    document.getElementById('searchBtn').addEventListener('click', openSearch);
    document.getElementById('searchCloseBtn').addEventListener('click', closeSearch);

    document.getElementById('tagSearchInput').addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            addTag(e.target.value);
        }
    });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.tab + '-tab').style.display = 'block';
        });
    });

    // Buttons
    document.getElementById('likeBtn').addEventListener('click', toggleLike);
    document.getElementById('dislikeBtn').addEventListener('click', toggleDislike);
    document.getElementById('refreshBtn').addEventListener('click', () => {
        resetFeed();
        fetchImages();
    });
    document.getElementById('clearTagsBtn').addEventListener('click', () => {
        activeTags = [];
        saveActiveTags();
        renderTags();
        resetFeed();
        updateStats();
    });
    document.getElementById('clearLikesBtn').addEventListener('click', () => {
        if (confirm('Clear all likes and dislikes?')) {
            likedPosts.clear();
            dislikedPosts.clear();
            saveLikedPosts();
            saveDislikedPosts();
            updateLikedCount();
            updateDislikedCount();
            curatedTags = [];
            saveCuratedTags();
            renderCuratedTags();
        }
    });
    document.getElementById('exportDataBtn').addEventListener('click', () => {
        const data = {
            tags: activeTags,
            likes: Array.from(likedPosts),
            dislikes: Array.from(dislikedPosts),
            curatedTags: curatedTags,
            topArtists: topArtists
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'scrollowo-data.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    // Settings
    document.getElementById('autoSuggestToggle').addEventListener('change', (e) => {
        settings.autoSuggest = e.target.checked;
        saveSettings();
    });
    document.getElementById('curateFromLikesToggle').addEventListener('change', (e) => {
        settings.curateFromLikes = e.target.checked;
        saveSettings();
    });
    document.getElementById('particlesToggle').addEventListener('change', (e) => {
        settings.particles = e.target.checked;
        saveSettings();
    });
    document.getElementById('autoPlayToggle').addEventListener('change', (e) => {
        settings.autoPlay = e.target.checked;
        saveSettings();
    });
    document.getElementById('autoScrollToggle').addEventListener('change', (e) => {
        settings.autoScroll = e.target.checked;
        saveSettings();
        if (e.target.checked) {
            startAutoScroll();
        } else {
            stopAutoScroll();
        }
    });
    document.getElementById('autoScrollInterval').addEventListener('change', (e) => {
        settings.autoScrollInterval = parseInt(e.target.value);
        saveSettings();
        if (settings.autoScroll) {
            startAutoScroll();
        }
    });
    document.getElementById('trackArtistsToggle').addEventListener('change', (e) => {
        settings.trackArtists = e.target.checked;
        saveSettings();
    });
    document.getElementById('rainbowModeToggle').addEventListener('change', (e) => {
        settings.rainbowMode = e.target.checked;
        saveSettings();
    });
    document.getElementById('themeSelect').addEventListener('change', (e) => {
        settings.theme = e.target.value;
        saveSettings();
    });

    // Scroll
    document.addEventListener('wheel', e => {
        if (!document.getElementById('searchModal').classList.contains('active')) {
            e.preventDefault();
            if (e.deltaY > 0) {
                nextImage();
            } else {
                prevImage();
            }
        }
    }, { passive: false });

    // Touch
    let touchStartY = 0;
    document.addEventListener('touchstart', e => {
        if (!document.getElementById('searchModal').classList.contains('active')) {
            touchStartY = e.touches[0].clientY;
        }
    });
    document.addEventListener('touchend', e => {
        const touchEndY = e.changedTouches[0].clientY;
        const diff = touchStartY - touchEndY;
        if (Math.abs(diff) > 50) {
            if (diff > 0) {
                nextImage();
            } else {
                prevImage();
            }
        }
    });

    // Keyboard
    document.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === ' ') {
            e.preventDefault();
            nextImage();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            prevImage();
        } else if (e.key === 'l' || e.key === 'L') {
            toggleLike();
        } else if (e.key === 'd' || e.key === 'D') {
            toggleDislike();
        }
    });
}

// Expose globally
window.app = {
    removeTag,
    addTag,
    addTagFromCurated: (tag) => {
        addTag(tag);
    }
};

// Initialize
init();
startAutoScroll();