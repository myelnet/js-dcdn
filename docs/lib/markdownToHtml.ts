import unified from 'unified';
import remark2rehype from 'remark-rehype';
import stringify from 'rehype-stringify';
import markdown from 'remark-parse';
import prism from '@mapbox/rehype-prism';
import slug from 'rehype-slug';
import link from 'rehype-autolink-headings';

export default function markdownToHtml(input: string): Promise<string> {
  return unified()
    .use(markdown)
    .use(remark2rehype)
    .use(stringify)
    .use(prism)
    .use(slug)
    .use(link)
    .process(input)
    .then((output) => String(output));
}
