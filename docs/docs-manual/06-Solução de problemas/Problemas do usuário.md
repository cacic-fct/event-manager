---
title: Problemas do usuário
---

| Problema                                               | Solução                                                                  |
| ------------------------------------------------------ |------------------------------------------------------------------------- |
| Aplicativo desatualizado                               | Atualizar ou cancelar o registro do Service Worker no menu Sobre  > Service Worker.<br/>Em último caso, utilizar uma guia anônima para evitar o caching do Service Worker. |
| Aztec Code não é lido pelo scanner                     | Use a inserção manual de presença.                                       |
| `{"message":"Invalid authorization state.", "error":"Bad Request","statusCode":400}`| O usuário demorou muito para fazer login, solicite para tentar novamente a partir da página de login. Se o usuário não demorou, pode ser que: o usuário abriu o login em duas abas, o callback está errado, cookies e sessão não foram preservados, redirect_uri mismatch, invalid proxy headers ou o backend perdeu a tentativa login dele em uma reinicialização.  |
