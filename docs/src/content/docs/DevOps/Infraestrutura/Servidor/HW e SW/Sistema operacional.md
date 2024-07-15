---
title: Sistema operacional
---

O sistema operacional escolhido para o servidor é o Debian.

Apesar dos alunos estarem mais habituados com o Arch Linux ou Ubuntu, a filosofia e diretrizes do Debian estão mais alinhados com as necessidades do projeto:  
É um sistema [seguro](https://wiki.debian.org/WhyDebian#Security_and_Reliability) e [robusto, pronto OOTB](https://wiki.debian.org/DontBreakDebian) e que [necessita de poucas atualizações](https://www.debian.org/releases/) – a major version só atualiza a cada 2 anos e é mantida por no mínimo 3 anos e o upgrade dificilmente quebra o SO.

O formato de Rolling Release adotado pelo Arch Linux pode ser problemático, pois não há alguém fazendo manutenções constantes. O Fedora tem um problema parecido.

Diferente da Canonical (Ubuntu), os mantenedores do Debian são firmes com essas políticas e não sofrem pressão do mercado.

## SSH

- `MaxAuthTries 3`
- `DebianBanner no`
- `Banner /etc/sshbanner`
- Autenticação por chave RSA

O acesso remoto é feito por meio da VPN da Unesp\*, com login por chave RSA.

\*Configurado pela DTI.

### /etc/sshbanner

```

Este servidor é gerenciado pelo CACiC,
com auxílio da Diretoria Técnica de Informática (DTI).

Confira na documentação os usuários que possuem acesso
e como entrar em contato com eles.

```

## ZRam

Para que o sistema utilize o ZRam corretamente, a partição de swap deve possuir a opção `pri=2` no lugar do `sw`.

### /etc/default/zramswap

```bash
# Compression algorithm selection
# speed: lz4 > zstd > lzo
# compression: zstd > lzo > lz4
# This is not inclusive of all that is available in latest kernels
# See /sys/block/zram0/comp_algorithm (when zram module is loaded) to see
# what is currently set and available for your kernel[1]
# [1]  https://github.com/torvalds/linux/blob/master/Documentation/blockdev/zram.txt#L86
ALGO=lz4

# Specifies the amount of RAM that should be used for zram
# based on a percentage the total amount of available memory
# This takes precedence and overrides SIZE below
#PERCENT=50

# Specifies a static amount of RAM that should be used for
# the ZRAM devices, this is in MiB
SIZE=4096

# Specifies the priority for the swap devices, see swapon(2)
# for more details. Higher number = higher priority
# This should probably be higher than hdd/ssd swaps.
PRIORITY=100
```




## Usuários

Conforme norma da Unesp, cada pessoa possui seu próprio usuário.\*

- dti (1000)
- fernando (1001)
- guibatalhoti (1002)
- willshobwish (1003)
- danielserezane (1004)
- renanyudi (1005)

\*Configurado pela DTI.

Todos os usuários possuem a senha `unesp#2024`, que não deve ser alterada.

Conforme [normas da Unesp](https://www2.unesp.br/portal#!/ai/regulamentos-e-normas16359/), se o acesso é remoto, não é permitido login com `root`, nem execução de comandos com `sudo` (permissão de root). No entanto, os usuários dos estudantes foram adicionados ao grupo `sudo` pela DTI.

Os usuários também foram adicionados ao grupo `docker`, para não ser necessário executar os comandos com `sudo`.

### /etc/motd

```

              ++
            ++ +++
         ++ +++++++
        ++ ++++++++++
      ++ +++++++++++++
    ++ ++++++++++++++++
   +++ ++++++++++++++ +++++       +++        +++++   +++    +++++
    ++ +++++++++++ +++++++++     +++++     +++++++++     +++++++++
   +++ +++++++++++ +++          +++ +++    +++       +++ +++
    ++ +++++++++++
   +++ ++++++++++  +++        +++     +++  +++       +++ +++
     ++ ++++++++   +++++++++ +++       +++ +++++++++ +++ +++++++++
      ++ ++++++    ++ +++++ +++         +++   +++++  +++    +++++
       ++  ++    +++
                    ++
                     ++
                      ++
                        ++++
 ----------------------------------
|                                  |
| Leia a documentação em:          |
| https://docs.fctapp.cacic.dev.br |
|                                  |
 ----------------------------------
```

## Pacote Docker

Enquanto não for disponibilizado um pacote Docker com o Compose v2 no repositório do Debian, deve-se instala-lo diretamente do repositório oficial do Docker.

## Backup

Enquanto uma solução de backup permanente não é implementada, o backup é feito manualmente.

No diretório `/home/shared`, o arquivo `docker-compose-backup.zpaq` é incrementado com o comando:

```bash
zpaqfranz a docker-compose-backup.???.zpaq ./docker-compose -filelist
```

Este comando deve ser executado como root, por conta das permissões dos arquivos do Docker.

Não delete os arquivos de números inferiores (antigos), pois eles são necessários para a restauração.

Os arquivo são, então, movidos para o servidor de [Yudi](https://github.com/Yudi).
