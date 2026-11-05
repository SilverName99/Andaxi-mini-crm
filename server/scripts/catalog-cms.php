<?php

declare(strict_types=1);

/**
 * Reface catalogul de pluginuri al CRM-ului (server/catalog/cms-pluginuri.json)
 * din config/plugins.php al CMS-ului (repo-ul andaxi-cms).
 *
 *   php server/scripts/catalog-cms.php ../andaxi-cms > server/catalog/cms-pluginuri.json
 *
 * Ia doar ce îi trebuie CRM-ului: cheia, numele, descrierea, dependențele și
 * marcajele fiecărui plugin (bani, intern, client, portat), pachetele de
 * abonament și listele licente_dev ale site-urilor existente. Ordinea
 * pluginurilor e cea din catalogul CMS-ului.
 */

if (PHP_SAPI !== 'cli') {
    exit(1);
}

$cms = rtrim((string) ($argv[1] ?? ''), '/');
$fisier = $cms . '/config/plugins.php';
if ($cms === '' || !is_file($fisier)) {
    fwrite(STDERR, "Folosire: php server/scripts/catalog-cms.php <dosarul repo-ului andaxi-cms>\n");
    exit(1);
}

$catalog = require $fisier;
$commit = trim((string) @shell_exec('git -C ' . escapeshellarg($cms) . ' rev-parse --short HEAD 2>/dev/null'));
$ramura = trim((string) @shell_exec('git -C ' . escapeshellarg($cms) . ' rev-parse --abbrev-ref HEAD 2>/dev/null'));

$pluginuri = [];
foreach ($catalog['pluginuri'] as $cheie => $p) {
    $pluginuri[] = [
        'cheie' => (string) $cheie,
        'nume' => (string) ($p['nume'] ?? $cheie),
        'descriere' => (string) ($p['descriere'] ?? ''),
        'necesita' => array_values((array) ($p['necesita'] ?? [])),
        'bani' => (bool) ($p['bani'] ?? false),
        'intern' => (bool) ($p['intern'] ?? false),
        'client' => (bool) ($p['client'] ?? false),
        'portat' => (bool) ($p['portat'] ?? true),
    ];
}

$pachete = [];
foreach ((array) ($catalog['pachete'] ?? []) as $cheie => $p) {
    $pachete[(string) $cheie] = [
        'nume' => (string) ($p['nume'] ?? $cheie),
        'pluginuri' => array_values((array) ($p['pluginuri'] ?? [])),
        'cel_putin_una_din' => array_values((array) ($p['cel_putin_una_din'] ?? [])),
        'optionale' => array_values((array) ($p['optionale'] ?? [])),
    ];
}

$rezultat = [
    '_despre' => 'Copie a catalogului din andaxi-cms/config/plugins.php. Nu se editează de mână: '
        . 'php server/scripts/catalog-cms.php <andaxi-cms> > server/catalog/cms-pluginuri.json',
    'sursa' => ['repo' => 'SilverName99/andaxi-cms', 'ramura' => $ramura, 'commit' => $commit, 'generat_la' => gmdate('Y-m-d\TH:i:s\Z')],
    'pluginuri' => $pluginuri,
    'pachete' => $pachete,
    'licente_dev' => (array) ($catalog['licente_dev'] ?? []),
];

echo json_encode($rezultat, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
