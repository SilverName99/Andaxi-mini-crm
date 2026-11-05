<?php

declare(strict_types=1);

/**
 * Puntea testului de interoperabilitate (server/src/lib/licenta.test.ts): trece
 * o licență prin codul CMS-ului însuși (andaxi-cms/src/Support/Licenta.php).
 *
 *   php server/scripts/licenta-cms.php verifica <andaxi-cms> <cheie-publica> <site>   < licenta.json
 *       → {"ok":…, "licenta":…, "eroare":…, "mesaj": "<mesajul semnat, base64>"}
 *   php server/scripts/licenta-cms.php semneaza <andaxi-cms>   < {"continut":{…},"cheie_privata":"<base64, 64 octeți>"}
 *       → textul licenta.json semnat de Licenta::semneaza
 *
 * Cheia privată dată la „semneaza” e doar cea de test a vectorului; cheia reală a
 * CRM-ului nu ajunge niciodată aici.
 */

if (PHP_SAPI !== 'cli') {
    exit(1);
}

[$_, $mod, $cms] = array_pad($argv, 3, '');
$fisier = rtrim($cms, '/') . '/src/Support/Licenta.php';
if (!is_file($fisier)) {
    fwrite(STDERR, "Nu găsesc $fisier\n");
    exit(2);
}
if (!function_exists('sodium_crypto_sign_verify_detached')) {
    fwrite(STDERR, "Extensia PHP sodium lipsește.\n");
    exit(2);
}
require $fisier;

use App\Support\Licenta;

$intrare = (string) stream_get_contents(STDIN);

if ($mod === 'verifica') {
    $dosar = sys_get_temp_dir() . '/crm-licenta-test-' . bin2hex(random_bytes(4));
    Licenta::configureaza(['dosar' => $dosar, 'cheie_publica' => (string) ($argv[3] ?? ''), 'site' => (string) ($argv[4] ?? '')]);
    $rezultat = Licenta::verifica($intrare);
    $date = json_decode($intrare, false);
    $mesaj = '';
    if ($date instanceof stdClass) {
        unset($date->semnatura);
        $mesaj = base64_encode(Licenta::mesajDeSemnat($date));
    }
    echo json_encode($rezultat + ['mesaj' => $mesaj], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
    exit(0);
}

if ($mod === 'semneaza') {
    $date = json_decode($intrare, true, 32, JSON_THROW_ON_ERROR);
    $cheie = base64_decode((string) $date['cheie_privata'], true);
    echo Licenta::semneaza((array) $date['continut'], (string) $cheie);
    exit(0);
}

fwrite(STDERR, "Mod necunoscut: verifica | semneaza\n");
exit(2);
