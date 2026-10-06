<?php
/**
 * Приём заявок с лендинга «Окна в порядке».
 * Проверяет данные, отсекает ботов, пишет в журнал, шлёт письмо (и в Telegram, если настроен).
 */
declare(strict_types=1);

date_default_timezone_set('Europe/Simferopol');
header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex');

function respond(bool $ok, string $error = '', int $code = 200): void
{
    http_response_code($code);
    echo json_encode($ok ? ['ok' => true] : ['ok' => false, 'error' => $error], JSON_UNESCAPED_UNICODE);
    exit;
}

function field(string $name, int $max = 300): string
{
    $v = $_POST[$name] ?? '';
    if (is_array($v)) {
        $v = implode(', ', array_map('strval', $v));
    }
    $v = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string)$v) ?? '');
    return mb_substr($v, 0, $max);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(false, 'method', 405);
}

$config = require __DIR__ . '/config.php';

// --- Антиспам ---
// 1. Honeypot: скрытое поле, которое люди не видят и не заполняют.
if (field('website') !== '') {
    respond(true); // делаем вид, что всё хорошо, — бот не узнает, что его отсекли
}
// 2. Слишком быстрая отправка (меньше 2 секунд на странице).
if ((int)field('elapsed', 10) < 2) {
    respond(true);
}

// --- Проверка полей ---
$digits = preg_replace('/\D/', '', field('phone', 40)) ?? '';
if (strlen($digits) === 11 && $digits[0] === '8') {
    $digits = '7' . substr($digits, 1);
}
if (strlen($digits) !== 11 || $digits[0] !== '7') {
    respond(false, 'phone', 422);
}
if (field('consent', 5) !== '1') {
    respond(false, 'consent', 422);
}

$phone = sprintf('+7 (%s) %s-%s-%s', substr($digits, 1, 3), substr($digits, 4, 3), substr($digits, 7, 2), substr($digits, 9, 2));

$formNames = ['hero' => 'Форма на первом экране', 'quiz' => 'Расчёт стоимости (квиз)', 'bottom' => 'Форма внизу страницы', 'modal' => 'Всплывающее окно'];
$formKey = field('form_name', 20);

$lead = [
    'Дата'        => date('d.m.Y H:i'),
    'Телефон'     => $phone,
    'Имя'         => field('name', 80),
    'Проблема'    => field('problem', 200),
    'Что сделать' => field('quiz_problem', 300),
    'Сколько окон' => field('quiz_count', 60),
    'Когда удобно' => field('quiz_when', 60),
    'Форма'       => $formNames[$formKey] ?? $formKey,
];
$tracking = [
    'utm_source'   => field('utm_source', 120),
    'utm_medium'   => field('utm_medium', 120),
    'utm_campaign' => field('utm_campaign', 200),
    'utm_content'  => field('utm_content', 200),
    'utm_term'     => field('utm_term', 200),
    'yclid'        => field('yclid', 60),
    'Страница'     => field('page', 300),
    'Откуда пришёл' => field('referrer', 300),
    'IP'           => $_SERVER['REMOTE_ADDR'] ?? '',
];

// --- Журнал ---
$logFile = $config['log_file'] ?? '';
if ($logFile) {
    $dir = dirname($logFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    $isNew = !file_exists($logFile);
    if ($fh = @fopen($logFile, 'ab')) {
        if ($isNew) {
            fwrite($fh, "\xEF\xBB\xBF"); // BOM, чтобы Excel открыл кириллицу
            fputcsv($fh, array_merge(array_keys($lead), array_keys($tracking)), ';');
        }
        fputcsv($fh, array_merge(array_values($lead), array_values($tracking)), ';');
        fclose($fh);
    }
}

// --- Письмо ---
$rows = '';
foreach ($lead as $k => $v) {
    if ($v === '') continue;
    $val = htmlspecialchars($v, ENT_QUOTES, 'UTF-8');
    if ($k === 'Телефон') {
        $val = '<a href="tel:+' . $digits . '" style="font-size:20px;font-weight:bold">' . $val . '</a>';
    }
    $rows .= '<tr><td style="padding:6px 12px;color:#6b7a90">' . $k . '</td><td style="padding:6px 12px">' . $val . '</td></tr>';
}
$trackRows = '';
foreach ($tracking as $k => $v) {
    if ($v === '') continue;
    $trackRows .= '<tr><td style="padding:4px 12px;color:#6b7a90">' . $k . '</td><td style="padding:4px 12px">' . htmlspecialchars($v, ENT_QUOTES, 'UTF-8') . '</td></tr>';
}
$html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#0f1b2d">'
    . '<h2 style="margin:0 0 12px">Новая заявка на выезд мастера</h2>'
    . '<table style="border-collapse:collapse">' . $rows . '</table>'
    . ($trackRows ? '<h4 style="margin:20px 0 6px;color:#6b7a90">Источник</h4><table style="border-collapse:collapse;font-size:13px">' . $trackRows . '</table>' : '')
    . '</div>';

$subject = 'Заявка с сайта: ' . $phone . ($lead['Проблема'] ? ' — ' . $lead['Проблема'] : '');
$fromName = '=?UTF-8?B?' . base64_encode($config['from_name']) . '?=';
$headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'From: ' . $fromName . ' <' . $config['from_email'] . '>',
    'X-Mailer: PHP',
];
$mailOk = @mail(
    $config['to_email'],
    '=?UTF-8?B?' . base64_encode($subject) . '?=',
    $html,
    implode("\r\n", $headers),
    '-f' . $config['from_email']
);

// --- Telegram (по желанию) ---
$tgOk = false;
if (!empty($config['telegram_bot_token']) && !empty($config['telegram_chat_id'])) {
    $text = "🪟 Новая заявка\n";
    foreach ($lead as $k => $v) {
        if ($v !== '') $text .= "$k: $v\n";
    }
    if ($tracking['utm_campaign'] || $tracking['utm_term']) {
        $text .= "\nКампания: {$tracking['utm_campaign']}\nФраза: {$tracking['utm_term']}";
    }
    $ctx = stream_context_create(['http' => [
        'method'  => 'POST',
        'header'  => 'Content-Type: application/x-www-form-urlencoded',
        'content' => http_build_query(['chat_id' => $config['telegram_chat_id'], 'text' => $text]),
        'timeout' => 5,
    ]]);
    $tgOk = @file_get_contents('https://api.telegram.org/bot' . $config['telegram_bot_token'] . '/sendMessage', false, $ctx) !== false;
}

if (!$mailOk && !$tgOk) {
    // Заявка всё равно сохранена в журнале, но клиенту честно предлагаем позвонить.
    respond(false, 'mail', 500);
}
respond(true);
