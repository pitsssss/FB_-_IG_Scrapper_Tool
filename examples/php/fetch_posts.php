<?php
/**
 * Server-side fetch helper for fb-posts-api.
 * Secrets come only from environment variables.
 */

function fb_posts_fetch(?string $pageUrl = null, int $limit = 10, int $timeoutSeconds = 20): array
{
    $base = rtrim(getenv('FB_POSTS_API_BASE_URL') ?: '', '/');
    $key = getenv('FB_POSTS_API_KEY') ?: '';
    $page = $pageUrl ?: (getenv('FB_POSTS_PAGE_URL') ?: '');

    if ($base === '' || $key === '' || $page === '') {
        return [
            'ok' => false,
            'status' => 0,
            'body' => null,
            'error' => 'Server misconfigured',
        ];
    }

    $url = $base . '/api/v1/facebook/posts?page=' . rawurlencode($page) . '&limit=' . max(1, min(10, $limit));

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeoutSeconds,
        CURLOPT_HTTPHEADER => [
            'x-api-key: ' . $key,
            'Accept: application/json',
        ],
    ]);

    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($raw === false) {
        return ['ok' => false, 'status' => 0, 'body' => null, 'error' => $curlErr ?: 'network_error'];
    }

    $body = json_decode($raw, true);
    if (!is_array($body)) {
        return ['ok' => false, 'status' => $status, 'body' => null, 'error' => 'invalid_json'];
    }

    if ($status !== 200 || empty($body['success'])) {
        $message = $body['error']['message'] ?? ('HTTP ' . $status);
        return ['ok' => false, 'status' => $status, 'body' => $body, 'error' => $message];
    }

    return ['ok' => true, 'status' => $status, 'body' => $body, 'error' => null];
}
