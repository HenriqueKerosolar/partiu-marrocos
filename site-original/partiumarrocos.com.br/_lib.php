<?php
/* PARTIU MARROCOS — helper compartilhado por save.php/upload.php/check-pass.php.
   Princípios reaproveitados dos outros produtos da casa (fabricaease/
   CongáOne): nunca hardcode segredo real no código versionado, falhar
   fechado quando a configuração não existe, limitar tentativas de senha.
   Adaptado para PHP puro (hospedagem compartilhada, sem Node/Redis): rate
   limit por arquivo em vez de em memória, já que processos PHP não
   compartilham memória entre requisições. */

function pm_admin_password() {
  $configFile = __DIR__ . "/config.php";
  if (!file_exists($configFile)) {
    return null; // falha fechada — sem config.php, nenhuma ação admin é permitida
  }
  require_once $configFile;
  if (!defined("PM_ADMIN_PASS") || PM_ADMIN_PASS === "" || PM_ADMIN_PASS === "troque-esta-senha-antes-de-publicar") {
    return null; // ainda no placeholder do config.example.php — trata como não configurado
  }
  return PM_ADMIN_PASS;
}

/* Rate limit simples por IP, em arquivo (mesmo espírito do rate-limit.ts do
   fabricaease — janela deslizante curta — adaptado pra PHP sem estado em
   memória entre requisições). 8 tentativas erradas / 10 minutos por IP. */
function pm_rate_limit_check() {
  $ip = $_SERVER["REMOTE_ADDR"] ?? "desconhecido";
  $dir = __DIR__ . "/.rl";
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  $file = $dir . "/" . preg_replace("/[^a-zA-Z0-9.:_-]/", "_", $ip) . ".json";

  $now = time();
  $window = 600; // 10 min
  $limit = 8;

  $attempts = [];
  if (file_exists($file)) {
    $raw = @file_get_contents($file);
    $decoded = $raw ? json_decode($raw, true) : null;
    if (is_array($decoded)) $attempts = $decoded;
  }
  $attempts = array_values(array_filter($attempts, function ($t) use ($now, $window) { return ($now - $t) < $window; }));

  if (count($attempts) >= $limit) {
    return ["allowed" => false, "retryAfter" => $window - ($now - $attempts[0])];
  }
  return ["allowed" => true, "file" => $file, "attempts" => $attempts];
}

function pm_rate_limit_record_failure($file, $attempts) {
  $attempts[] = time();
  @file_put_contents($file, json_encode($attempts));
}

function pm_rate_limit_clear($file) {
  @unlink($file);
}

/* Verifica a senha com rate limit — devolve true/false. Em caso de erro
   ("senha incorreta"), registra a tentativa falha (conta pro limite). Em
   caso de sucesso, limpa o histórico de tentativas daquele IP. */
function pm_check_password($submitted) {
  $real = pm_admin_password();
  if ($real === null) return ["ok" => false, "err" => "painel não configurado — copie config.example.php para config.php e defina uma senha real (veja o README)"];

  $rl = pm_rate_limit_check();
  if (!$rl["allowed"]) {
    return ["ok" => false, "err" => "muitas tentativas — aguarde " . ceil($rl["retryAfter"] / 60) . " min"];
  }

  if (!hash_equals($real, (string)$submitted)) {
    pm_rate_limit_record_failure($rl["file"], $rl["attempts"]);
    return ["ok" => false, "err" => "senha incorreta"];
  }

  pm_rate_limit_clear($rl["file"]);
  return ["ok" => true];
}
