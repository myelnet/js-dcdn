import Head from 'next/head';
import {PageProps} from '../types/page';
import {getPageBySlug, getPageSlugs, getAllPages} from '../lib/getPages';
import markdownToHtml from '../lib/markdownToHtml';
import Layout from '../components/Layout';

const menus: {[key: string]: any} = {
  'myel-js': [
    [
      {title: 'Getting Started', slug: '/getting-started'},
      {title: 'Roadmap', slug: '/roadmap'},
    ],
    [{title: 'Content Delivery', slug: '/content-delivery'}],
    [
      {title: 'Client', slug: '/client'},
      {title: 'PreloadController', slug: '/preload-controller'},
    ],
  ],
  pop: [
    [
      {title: 'Getting Started', slug: '/getting-started'},
      {title: 'Roadmap', slug: '/roadmap'},
    ],
    [
      {title: 'Client', slug: '/client'},
      {title: 'Provider', slug: '/provider'},
    ],
    [
      {title: 'CLI', slug: '/cli'},
      {title: 'HTTP', slug: '/http'},
    ],
  ],
};

export default function Page(props: PageProps) {
  return <Layout {...props} menu={menus[props.root]} />;
}

type Params = {
  params: {
    slug: string[];
  };
};

export async function getStaticProps({params}: Params) {
  const page = getPageBySlug(params.slug, ['title', 'description', 'content']);

  const content = await markdownToHtml(page.content || '');
  return {
    props: {
      ...page,
      content,
      root: params.slug[0],
    },
  };
}

export async function getStaticPaths() {
  const slugs = getAllPages(['slug']);
  return {
    paths: slugs.map((item) => '/' + item.slug),
    fallback: false,
  };
}
