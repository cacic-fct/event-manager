---
title: Níveis de acesso
sidebar:
  badge: Planned
---

Atualmente, o sistema só possui dois tipos de permissão: `admin` e `usuário`.

## admin

Permissão total e irrestrita.

## usuário

Permissão de escrita em documentos próprios.

---

:::note[Planned]
Esta seção mostra uma especificação que não foi implementada.  
:::

## Administrador (admin)

Possui acesso irrestrito ao FCT App.

Pode conceder ou revogar quaisquer cargos, incluindo o próprio ou de outros administradores.

Normalmente, pode ser:

- Membro essencial da equipe de desenvolvimento, um _lead developer_;
- Diretor executivo do CACiC;
- Diretor executivo da EJComp.

O acesso deve ser transferido manualmente após a conclusão do mandato.

:::caution
Tenha a autenticação em duas etapas ativada para evitar o comprometimento da conta.
:::

### DevOps

Por possuir acesso a informações sensíveis, é considerado um administrador.

### Administrador permanente (founding lead developer)

Não pode ter o acesso revogado.

## Moderador (mod)

Possui acesso irrestrito ao FCT App.  
Não pode conceder cargos iguais ou superiores ao seu.

Normalmente, pode ser:

- Diretor do CACiC;
- Diretor da EJComp;

O acesso é revogado automaticamente após 1 ano, independentemente do término do mandato.

## Organizador (organizer)

Possui permissões especiais para criar e gerenciar eventos desde que cumulativamente:

- O evento tenha sido criado há menos de 2 meses;
- Estejam relacionados ao curso do organizador;
- Se for evento para todo o campus, deve ter sido criado por alguém do curso do organizador.

Normalmente, pode ser:

- Diretor ou membro de qualquer CA;
- Diretor ou membro de qualquer EJ;
- Responsável por um evento:
  - Líder de comissão organizadora;
  - Pessoa autorizada pelo líder.

O acesso deve ser revogado automaticamente em 3 dias após o término do evento.

Possui acesso aos seguintes dados de usuários:

- Nome completo;
- Endereços de e-mail:
  - Institucional;
  - Pessoal;
- Número do celular;
- CPF;
- Vínculo com a Unesp;
  - Número do registro acadêmico (RA).

## Palestrante ou ministrante (host)

Possui as seguintes permissões no próprio evento:

- Editar;
- Consultar dados de inscritos;
- Coletar presença por leitura ou por inserção de código.

A permissão é revogada automaticamente 1 hora após o término do evento.

Possui acesso aos seguintes dados dos usuários inscritos no evento:

- Nome completo;
- Endereço de e-mail principal;
  - Se possui vínculo, o e-mail institucional;
- Vínculo com a Unesp;
  - Curso.

## Coletor de presença (attendance collector)

Possui permissões para coletar presença por leitura de código em eventos específicos, por um período limitado.

A revogação do acesso é automática.

Possui acesso aos seguintes dados dos usuários que tiveram a presença coletada:

- Nome completo;
- Vínculo com a Unesp;
  - Curso.

Além disso, tem acesso a quem compareceu ou não no evento específico.

## Professor

É usuário comum.

## Desenvolvedor

Os desenvolvedores que não necessitam de permissão de administrador são usuários comum.
