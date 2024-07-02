<script lang="ts">
  let statusPageAccessible: boolean | null = null;
  let sshAccessible: boolean | null = null;
  let pingServerWorks: boolean | null = null;
  let pingDtiServersWorks: boolean | null = null;
  let stop = false;

  function getResult(): string {
    if (sshAccessible) {
      if (statusPageAccessible) {
        return 'Faça login por SSH e reinicie os serviços afetados. Não entre em contato com a DTI.';
      } else {
        return 'Faça login por SSH e inicie o uptime-kuma: ele auxiliará a identificar outros serviços que estão off-line, para que você possa reiniciá-los. Não entre em contato com a DTI.';
      }
    }

    if (pingServerWorks) {
      return 'O servidor responde a pings. Pode ser que o servidor esteja reiniciando. Aguarde até 30 minutos e tente o acesso SSH novamente. Se o problema persistir, pode ser que o OpenSSH esteja configurado incorretamente ou que a porta 22 tenha sido bloqueada. Entre em contato com a DTI.';
    }

    if (pingDtiServersWorks) {
      return 'Pode ser que o servidor esteja reiniciando. Aguarde até 30 minutos e tente o acesso SSH novamente. Se o problema persistir, entre em contato com a DTI.';
    }

    if (!pingDtiServersWorks) {
      return 'Aguarde a solução do problema pela DTI. Entre em contato caso esteja demorando muito.';
    }
    return 'Ocorreu um erro na lógica do resultado.';
  }

  function setValue(key: string, value: boolean): void {
    switch (key) {
      case 'statusPageAccessible':
        statusPageAccessible = value;
        break;
      case 'sshAccessible':
        sshAccessible = value;
        break;
      case 'pingServerWorks':
        pingServerWorks = value;
        break;
      case 'pingDtiServersWorks':
        pingDtiServersWorks = value;
        break;
    }

    checkIfShouldStop();
    return;
  }

  function checkIfShouldStop(): void {
    if (sshAccessible) {
      stop = true;
    }

    if (pingServerWorks) {
      stop = true;
    }

    if (pingDtiServersWorks) {
      stop = true;
    }

    if (pingDtiServersWorks === false) {
      stop = true;
    }

    return;
  }

  function reset(): void {
    statusPageAccessible = null;
    sshAccessible = null;
    pingServerWorks = null;
    pingDtiServersWorks = null;
    stop = false;

    return;
  }
</script>

<div class="card bg-base-100 shadow-xl card-body mb-10">
  {#if statusPageAccessible === null}
    <h3>
      A <a href="https://status.cacic.dev.br" target="_blank">página de status</a> está acessível?
    </h3>

    <div class="card-actions justify-start">
      <button class="btn" on:click={() => setValue('statusPageAccessible', true)}>Sim</button>
      <button class="btn" on:click={() => setValue('statusPageAccessible', false)}>Não</button>
    </div>
  {/if}

  {#if statusPageAccessible !== null && sshAccessible === null}
    <blockquote>
      {#if statusPageAccessible === true}
        <p>A página de status do servidor está acessível.</p>
      {:else}
        <p>A página de status do servidor não está acessível.</p>
      {/if}
    </blockquote>

    <h3 class="mt-0">O servidor responde ao acesso SSH?</h3>
    <code> ssh -i ~/.ssh/id_rsa &lt;user&gt;@38a.fct.unesp.br </code>
    <div class="card-actions justify-start">
      <button class="btn" on:click={() => setValue('sshAccessible', true)}>Sim</button>
      <button class="btn" on:click={() => setValue('sshAccessible', false)}>Não</button>
      <br />
      <button class="btn" on:click={() => reset()}> Reiniciar </button>
    </div>
  {/if}

  {#if statusPageAccessible !== null && sshAccessible === false && pingServerWorks === null}
    <blockquote>
      {#if statusPageAccessible === true}
        A página de status do servidor está acessível.
      {:else}
        A página de status do servidor não está acessível.
      {/if}
      <br />

      O servidor não está acessível por SSH.
    </blockquote>

    <h3 class="mt-0">O servidor responde a pings?</h3>
    <code> ping 38a.fct.unesp.br </code>
    <div class="card-actions justify-start">
      <button class="btn" on:click={() => setValue('pingServerWorks', true)}>Sim</button>
      <button class="btn" on:click={() => setValue('pingServerWorks', false)}>Não</button>
      <br />
      <button class="btn" on:click={() => reset()}> Reiniciar </button>
    </div>
  {/if}

  {#if statusPageAccessible !== null && sshAccessible === false && pingServerWorks === false && pingDtiServersWorks === null}
    <blockquote>
      {#if statusPageAccessible === true}
        <p>A página de status do servidor está acessível.</p>
      {:else}
        <p>A página de status do servidor não está acessível.</p>
      {/if}

      <p>O servidor não está acessível por SSH.</p>
      <p>O servidor não responde a pings.</p>
    </blockquote>

    <h3 class="mt-0"><i>Toda</i> a infraestrutura de rede da DTI responde a pings?</h3>
    <code>ping fct1-pp.net.unesp.br<br />ping pprudente.fct.unesp.br </code>
    <div class="card-actions justify-start">
      <button class="btn" on:click={() => setValue('pingDtiServersWorks', true)}>Sim</button>
      <button class="btn" on:click={() => setValue('pingDtiServersWorks', false)}>Não</button>
      <br />
      <button class="btn" on:click={() => reset()}> Reiniciar </button>
    </div>
  {/if}

  {#if stop === true}
    <blockquote>
      {#if statusPageAccessible === true}
        <p>A página de status do servidor está acessível.</p>
      {:else if statusPageAccessible === false}
        <p>A página de status do servidor não está acessível.</p>
      {/if}

      {#if sshAccessible === true}
        <p>O servidor está acessível por SSH.</p>
      {:else if sshAccessible === false}
        <p>O servidor não está acessível por SSH.</p>
      {/if}

      {#if pingServerWorks === true}
        <p>O servidor responde a pings.</p>
      {:else if pingServerWorks === false}
        <p>O servidor não responde a pings.</p>
      {/if}

      {#if pingDtiServersWorks === true}
        <p>A infraestrutura da DTI responde a pings.</p>
      {:else if pingDtiServersWorks === false}
        <p>A infraestrutura da DTI não responde a pings.</p>
      {/if}
    </blockquote>

    <h3 class="mt-0">Recomendação</h3>

    <p>{getResult()}</p>

    <div class="card-actions justify-start">
      <button class="btn" on:click={() => reset()}> Reiniciar </button>
    </div>
  {/if}
</div>

<style>
  .btn {
    margin-top: 0;
  }
</style>
