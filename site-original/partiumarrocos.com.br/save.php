<?php
/* PARTIU MARROCOS — publica o data.json enviado pelo painel admin.
   Senha real vive em config.php (nunca neste arquivo — veja config.example.php
   e o README). */
require_once __DIR__ . "/_lib.php";

header("Content-Type: application/json; charset=utf-8");
$raw = file_get_contents("php://input");
$req = json_decode($raw, true);
if (!$req || !isset($req["pass"], $req["data"])) { echo json_encode(["ok"=>false,"err"=>"requisicao invalida"]); exit; }

$check = pm_check_password($req["pass"]);
if (!$check["ok"]) { echo json_encode($check); exit; }

$json = json_encode($req["data"], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT);
if ($json === false || strlen($json) < 50) { echo json_encode(["ok"=>false,"err"=>"dados invalidos"]); exit; }
/* backup do anterior */
if (file_exists(__DIR__."/data.json")) @copy(__DIR__."/data.json", __DIR__."/data.backup.json");
$ok = @file_put_contents(__DIR__."/data.json", $json) !== false;
echo json_encode(["ok"=>$ok, "err"=>$ok?null:"sem permissao de escrita (chmod 644/755 na pasta)"]);
