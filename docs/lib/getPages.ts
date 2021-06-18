import fs from 'fs';
import {join} from 'path';
import matter from 'gray-matter';

const docsDirectory = join(process.cwd(), '_docs');

export function getPageSlugs(): string[] {
  return readRecursive(docsDirectory);
}

export function readRecursive(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .reduce(
      (files: string[], file: string) =>
        fs.statSync(join(dir, file)).isDirectory()
          ? [...files, ...readRecursive(join(dir, file))]
          : [...files, join(dir.split(docsDirectory)[1], file)],
      []
    );
}

export function getPageBySlug(slug: string[], fields: string[] = []) {
  const slugStr = join(...slug);
  const realSlug = slugStr.replace(/\.md$/, '');
  const fullPath = join(docsDirectory, `${realSlug}.md`);
  const fileContents = fs.readFileSync(fullPath, 'utf8');
  const {data, content} = matter(fileContents);

  type Items = {
    [key: string]: string;
  };

  const items: Items = {};

  // Ensure only the minimal needed data is exposed
  fields.forEach((field) => {
    if (field === 'slug') {
      items[field] = realSlug;
    }
    if (field === 'content') {
      items[field] = content;
    }

    if (data[field]) {
      items[field] = data[field];
    }
  });

  return items;
}

export function getAllPages(fields: string[] = []) {
  const slugs = getPageSlugs();
  const posts = slugs.map((slug) => getPageBySlug(slug.split('/'), fields));
  return posts;
}
