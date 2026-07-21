// MediaVault — Frontend Application
const API = '/api';

const app = {
  media: [],
  currentFilter: 'all',
  currentSort: 'default',
  searchQuery: '',
  searchType: 'anime',
  selectedItem: null,
  currentDetailId: null,

  // Status labels
  statusLabels: {
    watching: 'Смотрю',
    planned: 'В планах',
    completed: 'Просмотрено',
    dropped: 'Брошено',
    on_hold: 'Отложено'
  },

  statusIcons: {
    watching: 'fa-play',
    planned: 'fa-bookmark',
    completed: 'fa-check',
    dropped: 'fa-trash',
    on_hold: 'fa-pause'
  },

  typeLabels: {
    anime: 'Аниме',
    movie: 'Фильм',
    tv: 'Сериал'
  },

  typeIcons: {
    anime: 'fa-tv',
    movie: 'fa-film',
    tv: 'fa-clapperboard'
  },

  async init() {
    await this.loadMedia();
    this.loadStats();
  },

  async loadMedia() {
    try {
      const params = new URLSearchParams();
      if (this.currentFilter !== 'all') params.append('status', this.currentFilter);
      if (this.currentSort !== 'default') params.append('sort', this.currentSort);
      if (this.searchQuery) params.append('search', this.searchQuery);

      const res = await fetch(`${API}/media?${params}`);
      this.media = await res.json();
      this.renderGrid();
    } catch (e) {
      this.showToast('Ошибка загрузки данных', 'error');
      console.error(e);
    }
  },

  async loadStats() {
    try {
      const res = await fetch(`${API}/media/stats`);
      const stats = await res.json();

      const byStatus = {};
      stats.by_status.forEach(s => byStatus[s.watch_status] = s.count);

      document.getElementById('statWatching').textContent = byStatus.watching || 0;
      document.getElementById('statPlanned').textContent = byStatus.planned || 0;
      document.getElementById('statCompleted').textContent = byStatus.completed || 0;
      document.getElementById('statFavorites').textContent = stats.favorites || 0;
      document.getElementById('statTotal').textContent = stats.total || 0;
      document.getElementById('statAvg').textContent = stats.overall_avg || '—';
    } catch (e) {
      console.error('Stats error:', e);
    }
  },

  renderGrid() {
    const grid = document.getElementById('mediaGrid');
    if (!this.media.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-film"></i>
          <h3>${this.currentFilter !== 'all' || this.searchQuery ? 'Ничего не найдено' : 'Коллекция пуста'}</h3>
          <p>${this.currentFilter !== 'all' || this.searchQuery ? 'Попробуйте изменить фильтры' : 'Добавьте первый фильм, сериал или аниме'}</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = this.media.map(item => this.renderCard(item)).join('');
  },

  renderCard(item) {
    const status = item.watch_status || 'planned';
    const userRating = item.user_rating || 0;
    const isFav = item.favorite === 1;
    const typeLabel = this.typeLabels[item.type] || item.type;
    const typeIcon = this.typeIcons[item.type] || 'fa-film';

    // Show user rating as text if set, otherwise show public rating
    const ratingDisplay = userRating > 0 
      ? `<span style="color:var(--warning)"><i class="fas fa-star" style="font-size:0.75rem;"></i> ${userRating}/10</span>`
      : `<span style="color:var(--text-muted)">—</span>`;

    return `
      <div class="media-card" data-id="${item.id}">
        <div class="media-card-image">
          ${item.image_url ? 
            `<img src="${item.image_url}" alt="${item.title}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\'no-image\'><i class=\'fas fa-image\'></i></div>'">` :
            `<div class="no-image"><i class="fas fa-image"></i></div>`
          }
          <span class="status-badge ${status}">${this.statusLabels[status]}</span>
          <span class="type-badge"><i class="fas ${typeIcon}"></i> ${typeLabel}</span>
          <button class="favorite-btn ${isFav ? 'active' : ''}" onclick="app.toggleFavorite(${item.id}, event)">
            <i class="fas fa-heart"></i>
          </button>
        </div>
        <div class="media-card-body">
          <h3 class="media-title">${item.title}</h3>
          <div class="media-meta">
            ${item.year ? `<span class="meta-tag"><i class="fas fa-calendar"></i> ${item.year}</span>` : ''}
            ${item.episodes && item.episodes !== '—' ? `<span class="meta-tag"><i class="fas fa-list"></i> ${item.episodes}</span>` : ''}
            ${item.duration && item.duration !== '—' ? `<span class="meta-tag"><i class="fas fa-clock"></i> ${item.duration}</span>` : ''}
          </div>
          ${item.description ? `<p class="media-description">${item.description}</p>` : ''}
          <div class="rating-section">
            <div class="public-rating">
              <i class="fas fa-star"></i>
              <span>${item.rating || '—'}</span>
            </div>
            <div class="user-rating-text" style="font-size:0.85rem;color:var(--text-secondary);">
              ${ratingDisplay}
            </div>
          </div>
        </div>
        <div class="card-actions">
          <button class="card-action-btn" onclick="app.openDetail(${item.id})">
            <i class="fas fa-edit"></i> Изменить
          </button>
          <button class="card-action-btn delete" onclick="app.deleteMedia(${item.id})">
            <i class="fas fa-trash"></i> Удалить
          </button>
        </div>
      </div>
    `;
  },

  // Rating interactions
  hoverRating(el, rating) {
    const container = el.parentElement;
    const stars = container.querySelectorAll('.star');
    stars.forEach((s, i) => {
      s.classList.toggle('active', i < rating);
    });
  },

  resetRating(el, actualRating) {
    const container = el.parentElement;
    const stars = container.querySelectorAll('.star');
    stars.forEach((s, i) => {
      s.classList.toggle('active', i < actualRating);
    });
  },

  resetAllRatings(id, actualRating) {
    const card = document.querySelector(`.media-card[data-id="${id}"]`);
    if (!card) return;
    const stars = card.querySelectorAll('.star');
    stars.forEach((s, i) => {
      s.classList.toggle('active', i < actualRating);
    });
  },

  async setRating(id, rating, event) {
    event.stopPropagation();
    try {
      const res = await fetch(`${API}/media/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_rating: rating })
      });
      if (res.ok) {
        this.showToast(`Оценка: ${rating}/10`, 'success');
        await this.loadMedia();
        this.loadStats();
      }
    } catch (e) {
      this.showToast('Ошибка сохранения оценки', 'error');
    }
  },

  async toggleFavorite(id, event) {
    event.stopPropagation();
    const item = this.media.find(m => m.id === id);
    if (!item) return;
    const newFav = item.favorite === 1 ? 0 : 1;
    try {
      const res = await fetch(`${API}/media/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: newFav })
      });
      if (res.ok) {
        this.showToast(newFav ? 'Добавлено в избранное' : 'Убрано из избранного', 'success');
        await this.loadMedia();
        this.loadStats();
      }
    } catch (e) {
      this.showToast('Ошибка', 'error');
    }
  },

  // Filters
  filterStatus(status) {
    this.currentFilter = status;
    document.querySelectorAll('.filter-chip[data-filter]').forEach(el => {
      el.classList.toggle('active', el.dataset.filter === status);
    });
    this.loadMedia();
  },

  sortBy(sort) {
    this.currentSort = sort;
    document.querySelectorAll('.filter-chip[data-sort]').forEach(el => {
      el.classList.toggle('active', el.dataset.sort === sort);
    });
    this.loadMedia();
  },

  searchCollection(query) {
    this.searchQuery = query;
    this.loadMedia();
  },

  resetFilters() {
    this.currentFilter = 'all';
    this.currentSort = 'default';
    this.searchQuery = '';
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('.filter-chip[data-filter]').forEach(el => {
      el.classList.toggle('active', el.dataset.filter === 'all');
    });
    document.querySelectorAll('.filter-chip[data-sort]').forEach(el => el.classList.remove('active'));
    this.loadMedia();
  },

  // Modal management
  openAddModal() {
    document.getElementById('addModal').classList.add('active');
    document.getElementById('searchQuery').focus();
  },

  closeModal(id) {
    document.getElementById(id).classList.remove('active');
  },

  setSearchType(type) {
    this.searchType = type;
    document.querySelectorAll('.search-type-tab').forEach(el => {
      el.classList.toggle('active', el.dataset.type === type);
    });
  },

  // Search functionality
  async search() {
    const query = document.getElementById('searchQuery').value.trim();
    if (!query) return;

    const resultsEl = document.getElementById('searchResults');
    resultsEl.innerHTML = '<div class="shimmer" style="height:80px;border-radius:8px;"></div>'.repeat(3);

    try {
      let endpoint = this.searchType === 'anime' 
        ? `${API}/search/shikimori?q=${encodeURIComponent(query)}`
        : `${API}/search/kinopoisk?q=${encodeURIComponent(query)}`;

      const res = await fetch(endpoint);
      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        const text = await res.text();
        console.error('Non-JSON response:', text.substring(0, 200));
        resultsEl.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:2rem;">
          <i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:0.5rem;display:block;"></i>
          Сервер вернул ошибку (${res.status}). Попробуйте позже.
        </div>`;
        return;
      }

      if (!res.ok) {
        const hint = data.hint ? `<br><small style="color:var(--text-muted)">${data.hint}</small>` : '';
        resultsEl.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:2rem;">
          <i class="fas fa-search" style="font-size:2rem;margin-bottom:0.5rem;display:block;opacity:0.5;"></i>
          ${data.error || 'Ошибка поиска'}${hint}
        </div>`;
        return;
      }

      if (!data.length) {
        resultsEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem;">Ничего не найдено</div>';
        return;
      }

      resultsEl.innerHTML = data.map(item => `
        <div class="search-result-item" onclick="app.selectSearchResult(${JSON.stringify(item).replace(/"/g, '&quot;')})">
          <img class="search-result-img" src="${item.image_url || ''}" alt="" onerror="this.style.display='none'">
          <div class="search-result-info">
            <div class="search-result-title">${item.title}</div>
            <div class="search-result-meta">
              ${item.year ? item.year : ''} ${item.kind ? '• ' + item.kind : ''} ${item.rating && item.rating !== '—' ? '• ★ ' + item.rating : ''}
            </div>
            ${item.description ? `<div class="search-result-desc">${item.description}</div>` : ''}
          </div>
        </div>
      `).join('');
    } catch (e) {
      resultsEl.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:2rem;">
        <i class="fas fa-wifi" style="font-size:2rem;margin-bottom:0.5rem;display:block;opacity:0.5;"></i>
        Ошибка сети. Проверьте подключение.
      </div>`;
      console.error(e);
    }
  },

  async searchByUrl() {
    const url = document.getElementById('searchUrl').value.trim();
    if (!url) return;

    const resultsEl = document.getElementById('searchResults');
    resultsEl.innerHTML = '<div class="shimmer" style="height:80px;border-radius:8px;"></div>';

    try {
      let endpoint;
      if (url.includes('shikimori')) {
        endpoint = `${API}/search/shikimori/url?url=${encodeURIComponent(url)}`;
      } else if (url.includes('kinopoisk')) {
        endpoint = `${API}/search/kinopoisk/url?url=${encodeURIComponent(url)}`;
      } else if (url.includes('imdb')) {
        endpoint = `${API}/search/omdb/url?url=${encodeURIComponent(url)}`;
      } else {
        resultsEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem;">Неизвестный URL. Поддерживаются: Shikimori, Kinopoisk, IMDb</div>';
        return;
      }

      const res = await fetch(endpoint);
      const data = await res.json();

      if (!res.ok) {
        resultsEl.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:2rem;">${data.error || 'Ошибка'}</div>`;
        return;
      }

      resultsEl.innerHTML = `
        <div class="search-result-item" onclick="app.selectSearchResult(${JSON.stringify(data).replace(/"/g, '&quot;')})">
          <img class="search-result-img" src="${data.image_url || ''}" alt="" onerror="this.style.display='none'">
          <div class="search-result-info">
            <div class="search-result-title">${data.title}</div>
            <div class="search-result-meta">${data.year || ''} ${data.kind ? '• ' + data.kind : ''}</div>
          </div>
        </div>
      `;
    } catch (e) {
      resultsEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem;">Ошибка</div>';
    }
  },

  async selectSearchResult(item) {
    this.selectedItem = item;

    const type = item.kind === 'Аниме' || this.searchType === 'anime' ? 'anime' : 
                 (item.type === 'tv' || item.type === 'series' ? 'tv' : 'movie');

    const body = {
      type: type,
      title: item.title,
      original_title: item.original_title || item.title,
      description: item.description || '',
      rating: item.rating || '',
      user_rating: 0,
      watch_status: 'planned',
      episodes: item.episodes || '—',
      duration: item.duration || '—',
      status: item.status || '',
      url: item.url || '',
      image_url: item.image_url || '',
      year: item.year || ''
    };

    try {
      const res = await fetch(`${API}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        this.showToast('Добавлено в коллекцию!', 'success');
        this.closeModal('addModal');
        document.getElementById('searchQuery').value = '';
        document.getElementById('searchUrl').value = '';
        document.getElementById('searchResults').innerHTML = '';
        await this.loadMedia();
        this.loadStats();
      } else {
        const err = await res.json();
        this.showToast(err.error || 'Ошибка добавления', 'error');
      }
    } catch (e) {
      this.showToast('Ошибка добавления', 'error');
    }
  },

  // Detail modal
  async openDetail(id) {
    const item = this.media.find(m => m.id === id);
    if (!item) return;
    this.currentDetailId = id;
    this.detailRating = item.user_rating || 0;

    const body = document.getElementById('detailBody');
    const status = item.watch_status || 'planned';
    const userRating = item.user_rating || 0;
    const isFav = item.favorite === 1;
    const typeLabel = this.typeLabels[item.type] || item.type;

    const stars = Array.from({length: 10}, (_, i) => {
      const filled = i < userRating;
      return `<span class="star ${filled ? 'active' : ''}" onclick="app.setDetailRating(${i + 1})" onmouseover="app.hoverDetailRating(this, ${i + 1})" onmouseout="app.resetDetailRating(this)" style="cursor:pointer;font-size:1.5rem;">★</span>`;
    }).join('');

    body.innerHTML = `
      <div class="detail-header">
        <img class="detail-poster" src="${item.image_url || ''}" alt="${item.title}" onerror="this.style.display='none'">
        <div class="detail-info">
          <h2 class="detail-title">${item.title}</h2>
          ${item.original_title && item.original_title !== item.title ? `<p style="color:var(--text-muted);margin-bottom:0.5rem;">${item.original_title}</p>` : ''}
          <div class="detail-meta">
            <span class="meta-tag"><i class="fas ${this.typeIcons[item.type] || 'fa-film'}"></i> ${typeLabel}</span>
            ${item.year ? `<span class="meta-tag"><i class="fas fa-calendar"></i> ${item.year}</span>` : ''}
            ${item.rating && item.rating !== '—' ? `<span class="meta-tag" style="color:var(--warning)"><i class="fas fa-star"></i> ${item.rating}</span>` : ''}
            ${item.episodes && item.episodes !== '—' ? `<span class="meta-tag"><i class="fas fa-list"></i> ${item.episodes}</span>` : ''}
            ${item.duration && item.duration !== '—' ? `<span class="meta-tag"><i class="fas fa-clock"></i> ${item.duration}</span>` : ''}
          </div>
          <div style="margin-top:1rem;">
            <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.5rem;">Ваша оценка</div>
            <div id="detailStars">${stars}</div>
          </div>
        </div>
      </div>

      ${item.description ? `<div class="detail-section"><div class="detail-section-title">Описание</div><p class="detail-description">${item.description}</p></div>` : ''}

      <div class="detail-section">
        <div class="detail-section-title">Статус просмотра</div>
        <div class="form-group">
          <select class="form-select" id="detailStatus">
            <option value="watching" ${status === 'watching' ? 'selected' : ''}>Смотрю</option>
            <option value="planned" ${status === 'planned' ? 'selected' : ''}>В планах</option>
            <option value="completed" ${status === 'completed' ? 'selected' : ''}>Просмотрено</option>
            <option value="dropped" ${status === 'dropped' ? 'selected' : ''}>Брошено</option>
            <option value="on_hold" ${status === 'on_hold' ? 'selected' : ''}>Отложено</option>
          </select>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Заметки</div>
        <textarea class="form-textarea" id="detailNotes" placeholder="Ваши личные заметки...">${item.notes || ''}</textarea>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Действия</div>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
          <button class="btn ${isFav ? 'btn-primary' : ''}" onclick="app.toggleDetailFavorite()">
            <i class="fas fa-heart"></i> ${isFav ? 'В избранном' : 'В избранное'}
          </button>
          ${item.url ? `<a href="${item.url}" target="_blank" class="btn"><i class="fas fa-external-link-alt"></i> Открыть страницу</a>` : ''}
        </div>
      </div>

      <div class="detail-section" style="font-size:0.8rem;color:var(--text-muted);">
        <div>Добавлено: ${item.added_date ? new Date(item.added_date).toLocaleDateString('ru-RU') : '—'}</div>
        ${item.completed_date ? `<div>Завершено: ${new Date(item.completed_date).toLocaleDateString('ru-RU')}</div>` : ''}
        ${item.rewatch_count > 0 ? `<div>Пересмотров: ${item.rewatch_count}</div>` : ''}
      </div>
    `;

    document.getElementById('detailModal').classList.add('active');
  },

  setDetailRating(rating) {
    this.detailRating = rating;
    const stars = document.querySelectorAll('#detailStars .star');
    stars.forEach((s, i) => s.classList.toggle('active', i < rating));
    // Visual feedback
    this.showToast(`Оценка: ${rating}/10`, 'success');
  },

  hoverDetailRating(el, rating) {
    const container = el.parentElement;
    const stars = container.querySelectorAll('.star');
    stars.forEach((s, i) => s.classList.toggle('active', i < rating));
  },

  resetDetailRating(el) {
    const container = el.parentElement;
    const stars = container.querySelectorAll('.star');
    const rating = this.detailRating || 0;
    stars.forEach((s, i) => s.classList.toggle('active', i < rating));
  },

  async toggleDetailFavorite() {
    const item = this.media.find(m => m.id === this.currentDetailId);
    if (!item) return;
    const newFav = item.favorite === 1 ? 0 : 1;
    try {
      await fetch(`${API}/media/${this.currentDetailId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: newFav })
      });
      item.favorite = newFav;
      this.openDetail(this.currentDetailId);
      await this.loadMedia();
      this.loadStats();
    } catch (e) {}
  },

  async saveDetailChanges() {
    if (!this.currentDetailId) return;

    const status = document.getElementById('detailStatus').value;
    const notes = document.getElementById('detailNotes').value;
    const rating = this.detailRating !== undefined ? this.detailRating : (this.media.find(m => m.id === this.currentDetailId)?.user_rating || 0);

    try {
      const res = await fetch(`${API}/media/${this.currentDetailId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          watch_status: status, 
          notes: notes,
          user_rating: rating
        })
      });

      if (res.ok) {
        this.showToast('Изменения сохранены', 'success');
        this.closeModal('detailModal');
        this.detailRating = null;
        await this.loadMedia();
        this.loadStats();
      }
    } catch (e) {
      this.showToast('Ошибка сохранения', 'error');
    }
  },

  // Delete
  async deleteMedia(id) {
    if (!confirm('Удалить из коллекции?')) return;
    try {
      const res = await fetch(`${API}/media/${id}`, { method: 'DELETE' });
      if (res.ok) {
        this.showToast('Удалено', 'success');
        await this.loadMedia();
        this.loadStats();
      }
    } catch (e) {
      this.showToast('Ошибка удаления', 'error');
    }
  },

  // Stats
  showStats() {
    this.showToast('Статистика обновлена', 'info');
    this.loadStats();
  },

  // Toast
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  // Close modals on backdrop click
  setupModalClose() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
      });
    });
  }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  app.init();
  app.setupModalClose();
});
