import React from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';
import { Code, Search, Container, Laptop, ClipboardPenLine, BookOpen } from 'lucide-react';
import Link from '@docusaurus/Link';

type FeatureItem = {
  title: string;
  icon: JSX.Element;
  description: JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Desenvolvedor',
    icon: <Code size={48} />,
    description: (
      <>
        Confira a seção{' '}
        <Link to="https://docs.fctapp.cacic.dev.br/Geral/Antes de colaborar/Suas obrigações">
          <b>Antes de colaborar</b>
        </Link>
        .
        <br />
        Conheça as experiências passadas na seção{' '}
        <Link to="/blog">
          <b>Blog</b>
        </Link>
        .
      </>
    ),
  },
  {
    title: 'Servidor da Unesp',
    icon: <Search size={48} />,
    description: (
      <>
        Conheça nossas boas práticas na seção de{' '}
        <Link to="/Geral/Especificações gerais/Auditing">
          <b>Especificações gerais</b>
        </Link>
        .
        <br />
        Saiba quem são os{' '}
        <Link to="https://cacic.dev.br/docs/Recursos/Servidores/FCTDTIWEBXP01#Encarregados/">
          <b>Encarregados de dados e de infraestrutura</b>
        </Link>
        .
      </>
    ),
  },
  {
    title: 'DevOps',
    icon: <Container size={48} />,
    description: (
      <>
        Confira a seção{' '}
        <Link to="/Geral/Antes de colaborar/Suas obrigações">
          <b>Antes de colaborar</b>
        </Link>
        .
        <br />
        Entenda a seção de{' '}
        <Link to="https://cacic.dev.br/docs/Recursos/Servidores/FCTDTIWEBXP01">
          <b>DevOps</b>
        </Link>
        .
        <br />
        Conheça as experiências passadas na seção{' '}
        <Link to="/blog">
          <b>Blog</b>
        </Link>
        .
      </>
    ),
  },
  {
    title: 'Administrador',
    icon: <Laptop size={48} />,
    description: (
      <>
        Confira a seção de{' '}
        <Link to="/Geral/Introdu%C3%A7%C3%A3o">
          <b>Especificações gerais</b>
        </Link>
        .
        <br />
        Entenda os{' '}
        <Link to="/Administração/Introdução">
          <b>Procedimentos</b>
        </Link>
        .
        <br />
        Saiba como{' '}
        <Link to="/Geral/Solução de problemas/Problemas do usuário">
          <b>Solucionar problemas</b>
        </Link>
        .
      </>
    ),
  },
  {
    title: 'Organizador',
    icon: <ClipboardPenLine size={48} />,
    description: (
      <>
        Confira a seção de{' '}
        <Link to="/Geral/Introdu%C3%A7%C3%A3o">
          <b>Especificações gerais</b>
        </Link>
        .
        <br />
        Entenda os{' '}
        <Link to="/Administração/Introdução">
          <b>Procedimentos</b>
        </Link>
        .
        <br />
        Saiba como{' '}
        <Link to="/Geral/Solução de problemas/Problemas do usuário">
          <b>Solucionar problemas do usuário</b>
        </Link>
        .
      </>
    ),
  },
  {
    title: 'Usuário',
    icon: <BookOpen size={48} />,
    description: (
      <>
        Se estiver com algum problema, confira a seção de{' '}
        <Link to="/Geral/Solução de problemas/Problemas do usuário">
          <b>Solução de problemas</b>
        </Link>
        .
        <br />
        Entenda o armazenamento dos seus dados em{' '}
        <Link to="/Geral/Especificações gerais/Dados dos usuários">
          <b>Dados dos usuários</b>
        </Link>
        .
        <br />
        Saiba sobre nossas{' '}
        <Link to="/Geral/Práticas sociais/Acessibilidade">
          <b>Práticas sociais</b>
        </Link>
        .
      </>
    ),
  },
];

function Feature({ title, icon, description }: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--justify">{icon}</div>
      <div className="text--justify">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
