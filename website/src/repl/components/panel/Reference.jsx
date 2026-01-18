import { memo, useEffect, useMemo, useState, Fragment } from 'react';

import jsdocJson from '../../../../../doc.json';
import { Textbox } from '../textbox/Textbox';

const isValid = ({ name, description }) => name && !name.startsWith('_') && !!description;

const availableFunctions = (() => {
  const seen = new Set(); // avoid repetition
  const functions = [];
  for (const doc of jsdocJson.docs) {
    if (!isValid(doc)) continue;
    if (seen.has(doc.name)) continue;

    // jsdoc also uses "tags" for when you use @something in the comments and it doesn't know what
    // @something is. We only want data from comments like `@tags fx, superdough` here.
    // If nothing is specified, we default to "untagged" for debugging
    doc.tags = doc.tags?.filter((t) => t && typeof t === 'string') || ['untagged'];
    functions.push(doc);

    const synonyms = doc.synonyms || [];
    seen.add(doc.name);
    for (const s of synonyms) {
      if (!s || seen.has(s)) continue;
      seen.add(s);
      // Swap `doc.name` in for `s` in the list of synonyms
      const synonymsWithDoc = [doc.name, ...synonyms].filter((x) => x && x !== s);
      functions.push({
        ...doc,
        name: s, // update names for the synonym
        longname: s,
        synonyms: synonymsWithDoc,
        synonyms_text: synonymsWithDoc.join(', '),
      });
    }
  }
  return functions.sort((a, b) => /* a.meta.filename.localeCompare(b.meta.filename) +  */ a.name.localeCompare(b.name));
})();

const getInnerText = (html) => {
  var div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

export const Reference = memo(function Reference() {
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState(null);
  const [selectedFunction, setSelectedFunction] = useState(null);

  const toggleTag = (tag) => {
    if (selectedTag === tag) {
      setSelectedTag(null);
    } else {
      setSelectedTag(tag);
    }
  };

  const searchVisibleFunctions = useMemo(() => {
    return availableFunctions.filter((entry) => {
      if (selectedTag) {
        if (!(entry.tags || ['untagged']).includes(selectedTag)) {
          return false;
        }
      }

      if (!search) {
        return true;
      }

      const lowerCaseSearch = search.toLowerCase();
      return (
        entry.name.toLowerCase().includes(lowerCaseSearch) ||
        (entry.synonyms?.some((s) => s.toLowerCase().includes(lowerCaseSearch)) ?? false)
      );
    });
  }, [search, selectedTag]);

  const detailVisibleFunctions = useMemo(() => {
    return searchVisibleFunctions.filter((x) => {
      if (selectedTag === null) {
        if (search) {
          return true;
        }
        return x.name === selectedFunction;
      } else {
        return true;
      }
    });
  }, [searchVisibleFunctions, selectedFunction, selectedTag]);

  const tagCounts = {};
  for (const doc of availableFunctions) {
    (doc.tags || ['untagged']).forEach((t) => {
      if (typeof t === 'string' && t) {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      }
    });
  }

  const onSearchTagFilterClick = () => {
    setSelectedTag(null);
    setSelectedFunction(null);
  };

  useEffect(() => {
    if (selectedFunction) {
      const el = document.getElementById(`doc-${selectedFunction}`);
      const container = document.getElementById('reference-container');
      container.scrollTo(0, el.offsetTop);
    }
  }, [selectedFunction]);

  return (
    <div className="flex h-full w-full p-2 overflow-hidden">
      <div className="h-full text-foreground flex flex-col gap-3 w-1/3 ">
        <div className="w-full flex">
          <Textbox
            className="w-full"
            placeholder="Search"
            value={search}
            onChange={(e) => {
              setSelectedFunction(null);
              setSearch(e);
            }}
          />
        </div>
        {selectedTag && (
          <div className="w-72">
            <span
              className="text-foreground border-2 border-gray-500 px-1 py-0.5 my-2 rounded-md cursor-pointer font-sans"
              onClick={onSearchTagFilterClick}
            >
              {selectedTag}
            </span>
          </div>
        )}
        <div className="flex flex-col h-full overflow-y-auto gap-1.5 bg-background bg-opacity-50 rounded-md">
          {searchVisibleFunctions.map((entry, i) => (
            <Fragment key={`entry-${entry.name}`}>
              <a
                className={
                  'cursor-pointer flex-none hover:bg-lineHighlight overflow-x-hidden px-1 text-ellipsis ' +
                  (entry.name === selectedFunction ? 'bg-lineHighlight font-bold' : '')
                }
                onClick={() => {
                  if (entry.name === selectedFunction) {
                    setSelectedFunction(null);
                  } else {
                    setSelectedFunction(entry.name);
                  }
                }}
              >
                {entry.name}
              </a>{' '}
            </Fragment>
          ))}
        </div>
      </div>
      <div
        className="break-normal flex-col overflow-y-auto overflow-x-hidden p-2 flex relative"
        id="reference-container"
      >
        <div className="prose dark:prose-invert min-w-full px-1 ">
          <h2>API Reference</h2>
          <p className="font-sans text-md">
            This is the long list of functions you can use. Remember that you don't need to remember all of those and
            that you can already make music with a small set of functions!
          </p>
          <div>
            {Object.entries(tagCounts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([t, count]) => (
                <span key={t}>
                  <a
                    className={[
                      'select-none text-white border-2 border-gray-500 px-1 py-0.5 my-2 cursor-pointer text-sm/8 rounded-md no-underline font-sans',
                      `${selectedTag === t ? 'bg-gray-500 text-black' : ''}`,
                    ].join(' ')}
                    onClick={() => toggleTag(t)}
                  >
                    {t}&nbsp;({count})
                  </a>{' '}
                </span>
              ))}
          </div>
          {detailVisibleFunctions.map((entry, i) => (
            <section key={i} className="font-sans">
              <div className="flex flex-row items-center mt-8 justify-between">
                <h3 className="font-mono my-0" id={`doc-${entry.name}`}>
                  {entry.name}
                </h3>
                {entry.tags && (
                  <span className="ml-2 text-xs text-gray-400 border-2 border-gray-500 rounded-md px-1 py-0.5">
                    {entry.tags.join(', ')}
                  </span>
                )}
              </div>
              {!!entry.synonyms_text && (
                <p>
                  Synonyms: <code>{entry.synonyms_text}</code>
                </p>
              )}
              {/* <small>{entry.meta.filename}</small> */}
              <p dangerouslySetInnerHTML={{ __html: entry.description }}></p>
              <ul>
                {entry.params?.map(({ name, type, description }, i) => (
                  <li key={i}>
                    {name} : {type?.names?.join(' | ')} {description ? <> - {getInnerText(description)}</> : ''}
                  </li>
                ))}
              </ul>
              {entry.examples?.map((example, j) => (
                <pre className="bg-background" key={j}>
                  {example}
                </pre>
              ))}
            </section>
          )) || <p className="font-sans">Searcb or select a tag to get started.</p>}
          {detailVisibleFunctions.length > 0 && <div className="h-screen" />}
        </div>
      </div>
    </div>
  );
});
