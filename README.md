# MediaVault — Медиа-библиотека (Vercel + Supabase)

Адаптированная версия оригинального проекта для хостинга на Vercel с PostgreSQL базой данных.

## Быстрый старт

### 1. Supabase
1. Перейди на [supabase.com](https://supabase.com)
2. Создай проект → скопируй **Connection string** (URI)
3. Строка выглядит так: `postgresql://postgres:PASSWORD@db.xxxxx.supabase.co:5432/postgres`

### 2. Vercel
1. Загрузи файлы на GitHub
2. Импортируй репозиторий на [vercel.com](https://vercel.com)
3. В **Environment Variables** добавь:
   - `DATABASE_URL` = строка подключения из Supabase
   - `OMDB_API_KEY` = (опционально)
4. Нажми **Deploy**

## API Endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/media | Коллекция с фильтрами |
| GET | /api/media/stats | Статистика |
| POST | /api/media | Добавить |
| PUT | /api/media/:id | Обновить |
| DELETE | /api/media/:id | Удалить |
| GET | /api/search/shikimori?q=... | Поиск аниме |
| GET | /api/search/kinopoisk?q=... | Поиск фильмов |

## Структура

```
├── api/
│   ├── media.js      # CRUD операции
│   └── search.js     # Поиск (Shikimori, Kinopoisk, OMDB)
├── public/
│   ├── index.html    # MediaVault UI
│   └── app.js        # Frontend логика
├── database.js       # PostgreSQL подключение
├── package.json
└── vercel.json
```
