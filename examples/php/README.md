# PHP server-side integration

## Environment

```bash
export FB_POSTS_API_BASE_URL="https://api.example.com"
export FB_POSTS_API_KEY="your_site_secret_here"
export FB_POSTS_PAGE_URL="https://www.facebook.com/cern"
```

Run behind your web server so the key never reaches the browser.

## Files

- `fetch_posts.php` — cURL helper with timeout and JSON validation
- `render_posts.php` — HTML escaping example

Usage:

```bash
php render_posts.php
```
