<?php
/* PARTIU MARROCOS — valida a senha do gate do painel admin contra o
   servidor (config.php), com o mesmo rate limit de save.php/upload.php.
   Existe pra js/admin.js parar de comparar a senha só no navegador (o
   fallback hardcoded ali era visível em "ver código-fonte"). */
require_once __DIR__ . "/_lib.php";

header("Content-Type: application/json; charset=utf-8");
$raw = file_get_contents("php://input");
$req = json_decode($raw, true);
$pass = is_array($req) ? ($req["pass"] ?? "") : "";
echo json_encode(pm_check_password($pass));
