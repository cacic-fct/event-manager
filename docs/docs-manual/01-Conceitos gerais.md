# Conceitos gerais

## Painel de administração

O painel de administração é a interface principal para gerenciar o sistema, onde os organizadores podem configurar eventos, gerenciar usuários, criar formulários e coletar presenças. Ele é acessível apenas para usuários com permissões administrativas, que são definidas no Keycloak.

O painel é desktop-first e não é otimizado para uso em dispositivos móveis. Ele também não é otimizado para conexões limitadas, pois consome muitos dados. Portanto, para coletar presenças durante o evento, é recomendado usar o aplicativo público, que é projetado para ser leve e fácil de usar em dispositivos móveis.

Está disponível em https://eventos.cacic.dev.br/admin/

### Soft delete

O sistema é adepto do "soft delete", ou seja, quando um item é deletado, ele não é removido permanentemente do banco de dados, mas sim marcado como deletado. Isso permite que o item seja restaurado posteriormente, caso necessário.

Por conta disso, não crie itens (eventos, etc.) para teste, pois eles não serão permanentemente deletados e podem causar confusão no futuro. 

Execute o projeto localmente para realizar testes.

Também pode acontecer de itens já deletados aparecerem na interface administrativa. Caso isso aconteça, [crie uma issue no GitHub](https://github.com/cacic-fct/event-manager/issues/new) ou entre em contato com a equipe de DevOps para que o item seja permanentemente deletado do banco de dados.

## Aplicativo público

O aplicativo público é a interface voltada para os participantes do evento, onde eles podem se inscrever, acessar informações sobre o evento e coletar suas presenças. Ele é acessível para todos os usuários, incluindo aqueles sem permissões administrativas.

Também possui funcionalidades específicas para professores e para organizadores, para não ser necessário a liberação do painel de administração para estes grupos.

Está disponível em https://eventos.cacic.dev.br/app/