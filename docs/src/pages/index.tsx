import React from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  Code2,
  ExternalLink,
  FileText,
  LifeBuoy,
  ScanLine,
  Server,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import styles from './index.module.css';

type HomeLink = {
  label: string;
  to: string;
  external?: boolean;
};

type AudienceEntry = {
  icon: LucideIcon;
  title: string;
  description: string;
  links: HomeLink[];
};

type ReferenceGroup = {
  icon: LucideIcon;
  title: string;
  description: string;
  links: HomeLink[];
};

const audienceEntries: AudienceEntry[] = [
  {
    icon: CalendarCheck,
    title: 'Organização de eventos',
    description: 'Criação, publicação e manutenção de eventos, inscrições, presenças e certificados.',
    links: [
      { label: 'Visão geral do manual', to: '/Manual/Introdu%C3%A7%C3%A3o' },
      {
        label: 'Eventos, grupos e grandes eventos',
        to: '/Manual/Gerenciar%20Eventos/Entenda%20a%20estrutura%C3%A7%C3%A3o',
      },
      { label: 'Área administrativa', to: '/Manual/Interface%20administrativa/Vis%C3%A3o%20geral' },
    ],
  },
  {
    icon: ScanLine,
    title: 'Coleta de presença',
    description: 'Procedimentos para configurar, coletar, sincronizar e confirmar presença em campo.',
    links: [
      {
        label: 'Tipos de coleta de presença',
        to: '/Manual/Coleta%20de%20presen%C3%A7as/Tipos%20de%20coleta%20de%20presen%C3%A7a',
      },
      { label: 'Boas práticas de coleta', to: '/Manual/Coleta%20de%20presen%C3%A7as/Boas%20pr%C3%A1ticas' },
      {
        label: 'Confirmação pelo participante',
        to: '/Manual/Interface%20p%C3%BAblica/Presen%C3%A7as/Confirmar%20presen%C3%A7a',
      },
    ],
  },
  {
    icon: Server,
    title: 'Permissões e operação',
    description: 'Acesso, autorização, auditoria, privacidade e manutenção dos ambientes do sistema.',
    links: [
      { label: 'Perfis e níveis de acesso', to: '/Geral/Especifica%C3%A7%C3%B5es%20gerais/N%C3%ADveis%20de%20acesso' },
      { label: 'Autorização e permissões', to: '/Backend/Autoriza%C3%A7%C3%A3o%20e%20permiss%C3%B5es' },
      {
        label: 'Servidor FCTDTIWEBXP01',
        to: 'https://cacic.dev.br/docs/Recursos/Servidores/FCTDTIWEBXP01',
        external: true,
      },
    ],
  },
  {
    icon: Code2,
    title: 'Contribuição no código',
    description: 'Convenções para alterar frontend, backend, pacotes e documentação sem quebrar fluxos reais.',
    links: [
      { label: 'Obrigações antes de contribuir', to: '/Geral/Antes%20de%20colaborar/Suas%20obriga%C3%A7%C3%B5es' },
      { label: 'Frontend', to: '/Frontend/Introdu%C3%A7%C3%A3o' },
      { label: 'Backend', to: '/Backend/Introdu%C3%A7%C3%A3o' },
    ],
  },
  {
    icon: FileText,
    title: 'Documentação do projeto',
    description: 'Padrões de busca, escrita e organização para manter o manual claro e confiável.',
    links: [
      { label: 'Busca na documentação', to: '/Geral/Documenta%C3%A7%C3%A3o/Busca' },
      { label: 'Estilo de redação', to: '/Geral/Documenta%C3%A7%C3%A3o/Estilo%20de%20reda%C3%A7%C3%A3o' },
      { label: 'Regras da documentação', to: '/Geral/Documenta%C3%A7%C3%A3o/Especifica%C3%A7%C3%B5es' },
    ],
  },
  {
    icon: Users,
    title: 'App público e perfil',
    description: 'Fluxos para participantes e ministrantes: inscrição, pagamento, crachá, presença e certificados.',
    links: [
      { label: 'Visão geral do app público', to: '/Manual/Interface%20p%C3%BAblica/Vis%C3%A3o%20geral' },
      {
        label: 'Problemas de acesso e uso',
        to: '/Manual/Solu%C3%A7%C3%A3o%20de%20problemas/Problemas%20do%20usu%C3%A1rio',
      },
      {
        label: 'Privacidade e dados do usuário',
        to: '/Geral/Especifica%C3%A7%C3%B5es%20gerais/Dados%20dos%20usu%C3%A1rios',
      },
    ],
  },
];

const referenceGroups: ReferenceGroup[] = [
  {
    icon: ClipboardCheck,
    title: 'Operação de eventos',
    description: 'Checklists e correções para antes, durante e depois de eventos reais.',
    links: [
      { label: 'Antes de todo evento', to: '/Manual/Gerenciar%20Eventos/Antes%20de%20todo%20evento' },
      { label: 'Certificados', to: '/Manual/Interface%20administrativa/Certificados' },
      {
        label: 'Problemas do administrador',
        to: '/Manual/Solu%C3%A7%C3%A3o%20de%20problemas/Problemas%20do%20administrador',
      },
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Segurança, dados e auditoria',
    description: 'Leitura obrigatória antes de mexer com permissões, privacidade ou rastreabilidade.',
    links: [
      { label: 'Dados dos usuários', to: '/Geral/Especifica%C3%A7%C3%B5es%20gerais/Dados%20dos%20usu%C3%A1rios' },
      { label: 'Proteção contra abuso', to: '/Backend/Prote%C3%A7%C3%A3o%20contra%20abuso%20e%20privacidade' },
      { label: 'Auditoria', to: '/Geral/Especifica%C3%A7%C3%B5es%20gerais/Auditing' },
    ],
  },
  {
    icon: BookOpen,
    title: 'Desenvolvimento do sistema',
    description: 'Referências técnicas para mudanças de código, contratos e rotas.',
    links: [
      { label: 'Tecnologias', to: '/Geral/Antes%20de%20colaborar/Tecnologias' },
      { label: 'API', to: '/Backend/API' },
      { label: 'Rotas do frontend', to: '/Frontend/C%C3%B3digo/Rotas' },
    ],
  },
  {
    icon: LifeBuoy,
    title: 'Quando não souber onde procurar',
    description: 'Pontos de partida para dúvidas frequentes, decisões antigas e código-fonte.',
    links: [
      { label: 'Perguntas frequentes', to: '/Geral/Perguntas%20frequentes/perguntas-frequentes' },
      { label: 'Histórico de decisões', to: '/blog' },
      { label: 'Repositório', to: 'https://github.com/cacic-fct/event-manager', external: true },
    ],
  },
];

function LinkIcon({ external }: { external?: boolean }) {
  const Icon = external ? ExternalLink : ArrowRight;

  return <Icon aria-hidden="true" size={16} strokeWidth={2.25} />;
}

function LinkList({ links }: { links: HomeLink[] }) {
  return (
    <ul className={styles.linkList}>
      {links.map((link) => (
        <li key={link.label}>
          <Link to={link.to}>
            <span>{link.label}</span>
            <LinkIcon external={link.external} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CardHeading({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className={styles.cardHeading}>
      <span className={styles.cardIcon} aria-hidden="true">
        <Icon size={19} strokeWidth={2.15} />
      </span>
      <h3>{title}</h3>
    </div>
  );
}

function AudienceCard({ icon, title, description, links }: AudienceEntry) {
  return (
    <article className={styles.audienceCard}>
      <CardHeading icon={icon} title={title} />
      <p className={styles.cardDescription}>{description}</p>
      <LinkList links={links} />
    </article>
  );
}

function ReferenceGroup({ icon, title, description, links }: ReferenceGroup) {
  return (
    <article className={styles.referenceGroup}>
      <CardHeading icon={icon} title={title} />
      <p className={styles.cardDescription}>{description}</p>
      <LinkList links={links} />
    </article>
  );
}

export default function Home(): React.JSX.Element {
  return (
    <Layout
      title="Início"
      description="Documentação interna do CACiC Event Manager para participantes, organizadores, administradores, desenvolvedores e operadores.">
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.container}>
            <div className={styles.heroContent}>
              <h1>Manual do Event Manager</h1>
              <p className={styles.heroLead}>
                Documentação interna para operar, administrar, manter e auditar o CACiC Event Manager. Consulte o manual
                antes de agir sobre inscrições, presença, certificados, permissões, dados reais ou produção.
              </p>
              <div className={styles.heroActions} aria-label="Entradas principais">
                <Link className={styles.primaryAction} to="/Manual/Introdu%C3%A7%C3%A3o">
                  Abrir manual
                  <ArrowRight aria-hidden="true" size={17} strokeWidth={2.25} />
                </Link>
                <Link className={styles.secondaryAction} to="/busca">
                  Pesquisar na documentação
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="audiences-heading">
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 id="audiences-heading">Comece pela tarefa</h2>
              <p>Uso público, organização de eventos, coleta, código, operação e documentação.</p>
            </div>
            <div className={styles.audienceGrid}>
              {audienceEntries.map((entry) => (
                <AudienceCard key={entry.title} {...entry} />
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="reference-heading">
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 id="reference-heading">Consultas recorrentes</h2>
              <p>Páginas para decisões operacionais, segurança, desenvolvimento e dúvidas frequentes.</p>
            </div>
            <div className={styles.referenceGrid}>
              {referenceGroups.map((group) => (
                <ReferenceGroup key={group.title} {...group} />
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
