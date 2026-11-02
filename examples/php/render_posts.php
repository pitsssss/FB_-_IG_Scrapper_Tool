<?php
require __DIR__ . '/fetch_posts.php';

$result = fb_posts_fetch();

header('Content-Type: text/html; charset=utf-8');

if (!$result['ok']) {
    echo '<section><p>Facebook updates are temporarily unavailable.</p></section>';
    exit;
}

$page = $result['body']['data']['page'] ?? [];
$posts = $result['body']['data']['posts'] ?? [];
$stale = !empty($result['body']['meta']['stale']);

echo '<section>';
echo '<h2>' . htmlspecialchars((string) ($page['name'] ?? 'Facebook'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</h2>';
if ($stale) {
    echo '<p>Showing recently cached posts.</p>';
}

$logo = (string) ($page['logo'] ?? $page['logo_fallback'] ?? '');
if ($logo !== '') {
    echo '<img src="' . htmlspecialchars($logo, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '" alt="" width="48" height="48" />';
}

echo '<ul>';
foreach ($posts as $post) {
    echo '<li>';
    if (!empty($post['created_at'])) {
        echo '<time datetime="' . htmlspecialchars((string) $post['created_at'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '">'
            . htmlspecialchars((string) $post['created_at'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</time>';
    }
    $text = (string) ($post['text'] ?? '');
    if ($text !== '') {
        echo '<p>' . htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>';
    }
    if (!empty($post['image'])) {
        echo '<img src="' . htmlspecialchars((string) $post['image'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '" alt="" loading="lazy" />';
    }
    if (!empty($post['url'])) {
        $href = htmlspecialchars((string) $post['url'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        echo '<p><a href="' . $href . '" target="_blank" rel="noopener noreferrer">View on Facebook</a></p>';
    }
    echo '</li>';
}
echo '</ul></section>';
