<?php
/* PARTIU MARROCOS — recebe imagens do painel e grava em img/.
   Senha real vive em config.php (veja _lib.php/README).
   SVG foi removido do allowlist: um SVG pode carregar <script>/onload= e
   virar XSS armazenado quando aberto direto pelo navegador — sanitizar SVG
   direito exige uma biblioteca dedicada, não uma checagem de extensão/MIME
   simples. Se precisar mesmo de um SVG (ex.: logo), suba por FTP/cPanel
   direto na pasta img/, já revisado manualmente. */
require_once __DIR__ . "/_lib.php";

header("Content-Type: application/json; charset=utf-8");
$check = pm_check_password($_POST["pass"] ?? "");
if (!$check["ok"]) { echo json_encode($check); exit; }

if (!isset($_FILES["file"]) || $_FILES["file"]["error"] !== UPLOAD_ERR_OK) { echo json_encode(["ok"=>false,"err"=>"arquivo nao recebido"]); exit; }
$f = $_FILES["file"];
if ($f["size"] > 8*1024*1024) { echo json_encode(["ok"=>false,"err"=>"maximo 8 MB"]); exit; }
$ext = strtolower(pathinfo($f["name"], PATHINFO_EXTENSION));
$allow = ["jpg","jpeg","png","webp","gif"];
if (!in_array($ext, $allow)) { echo json_encode(["ok"=>false,"err"=>"use jpg, png, webp ou gif (svg não é aceito por upload — veja o comentário no topo deste arquivo)"]); exit; }
$mime = mime_content_type($f["tmp_name"]);
if (strpos($mime, "image/") !== 0) { echo json_encode(["ok"=>false,"err"=>"arquivo nao e imagem"]); exit; }
$name = preg_replace("/[^a-z0-9\-_]/","-", strtolower(pathinfo($f["name"], PATHINFO_FILENAME)));
$name = trim(substr($name,0,50),"-"); if($name==="") $name="img";
$dest = "img/".$name."-".substr(md5(uniqid()),0,6).".".$ext;
@mkdir(__DIR__."/img", 0755, true);
$ok = @move_uploaded_file($f["tmp_name"], __DIR__."/".$dest);
echo json_encode(["ok"=>$ok, "path"=>$ok?$dest:null, "err"=>$ok?null:"sem permissao de escrita em img/"]);
