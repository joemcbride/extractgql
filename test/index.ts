import * as chai from 'chai';
const { assert } = chai;

import {
  createDocumentFromQuery,
} from '../src/extractFromAST';
import {
  ExtractGQL,
  OutputMap,
} from '../src/ExtractGQL';
import { parse, print, OperationDefinition } from 'graphql';
import gql from 'graphql-tag';

describe('ExtractGQL', () => {
  const queries = gql`
    query {
      author {
        firstName
        lastName
      }
    }

    query otherQuery {
      person {
        firstName
        lastName
      }
    }`;
  const egql = new ExtractGQL({ inputFilePath: 'not-real'});
  const keys = [
    egql.getQueryKey(queries.definitions[0]),
    egql.getQueryKey(queries.definitions[1]),
  ];

  it('should be able to construct an instance', () => {
    assert.doesNotThrow(() => {
      new ExtractGQL({
        inputFilePath: 'queries.graphql',
        outputFilePath: 'output.json',
      });
    });
  });

  describe('isDirectory', () => {
    it('should return true on a directory', (done) => {
      ExtractGQL.isDirectory('./test/fixtures').then((result: boolean) => {
        assert(result);
        done();
      });
    });

    it('should return false on a file', (done) => {
      ExtractGQL.isDirectory('./test/fixtures/queries.graphql').then((result) => {
        assert(!result);
        done();
      });
    });
  });

  describe('getFileExtension', () => {
    it('should return the correct extension on a file with an extension', () => {
      assert.equal(ExtractGQL.getFileExtension('../../path/source.graphql'), 'graphql');
      assert.equal(ExtractGQL.getFileExtension('/some/complicated/path.with.dots/dots../view.js'), 'js');
    });
    it('should return an empty string if the file has no extension', () => {
      assert.equal(ExtractGQL.getFileExtension('/redherring.graphql/file'), '');
      assert.equal(ExtractGQL.getFileExtension('file'), '');
    });
  });

  describe('readFile', () => {
    it('should be able to read a file into a string', (done) => {
      const filePath = 'test/fixtures/queries.graphql';
      ExtractGQL.readFile(filePath).then((result) => {
        const graphQLString = print(parse(result));
        assert.deepEqual(graphQLString, print(queries));
        done();
      });
    });
  });

  describe('createMapFromDocument', () => {
    it('should be able to handle a document with no queries', () => {
      const document = gql`mutation something { otherThing }`;
      const map = egql.createMapFromDocument(document);
      assert.deepEqual(map, {});
    });

    it('should be able to handle a document with a single query', () => {
      const myegql = new ExtractGQL({ inputFilePath: 'nothing' });
      const document = gql`query author {
        name
      }`;
      const map = myegql.createMapFromDocument(document);
      assert.deepEqual(map, {
        [egql.getQueryKey(document.definitions[0])]: {
          transformedQuery: document,
          id: 1,
        },
      });
    });

    it('should be able to handle a document with a fragment', () => {
      const myegql = new ExtractGQL({ inputFilePath: 'empty' });
      const document = gql`
        query authorList {
          author {
            ...authorDetails
          }
        }
        fragment authorDetails on Author {
          firstName
          lastName
        }
      `;
      const map = myegql.createMapFromDocument(document);

      assert.deepEqual(map, {
        [myegql.getQueryKey(document.definitions[0])]: {
          transformedQuery: document,
          id: 1,
        },
      });
    });

    it('should be able to handle a document with multiple fragments', () => {
      const myegql = new ExtractGQL({ inputFilePath: 'empty' });
      const document = gql`
        query authorList {
          author {
            ...authorDetails
            ...otherDetails
          }
        }
        fragment authorDetails on Author {
          firstName
          lastName
        }
        fragment otherDetails on Author {
          author
        }`;
      const map = myegql.createMapFromDocument(document);
      const key = myegql.getQueryKey(document.definitions[0]);
      assert.equal(print(map[key].transformedQuery), print(document));
    });

    it('should be able to handle a document with unused fragments', () => {
      const myegql = new ExtractGQL({ inputFilePath: 'empty' });
      const document = gql`
        query authorList {
          author {
            firstName
            lastName
          }
        }
        fragment pointlessFragment on Author {
          firstName
          lastName
        }
      `;
      const map = egql.createMapFromDocument(document);
      const key = myegql.getQueryKey(document.definitions[0]);
      assert.equal(
        print(map[key].transformedQuery),
        print(createDocumentFromQuery(document.definitions[0]))
      );
    });

    it('should be able to handle a document with multiple queries sharing a fragment', () => {
      const myegql = new ExtractGQL({ inputFilePath: 'empty' });
      const document = gql`
        query authorList {
          author {
            ...authorDetails
          }
        }
        query authorInfo {
          author {
            ...authorDetails
          }
        }
        fragment authorDetails on Author {
          firstName
          lastName
        }
      `;
      const authorList = gql`
        query authorList {
          author {
            ...authorDetails
          }
        }
        fragment authorDetails on Author {
          firstName
          lastName
        }
      `;
      const authorInfo = gql`
        query authorInfo {
          author {
            ...authorDetails
          }
        }
        fragment authorDetails on Author {
          firstName
          lastName
        }
      `;
      const map = myegql.createMapFromDocument(document);
      const key1 = myegql.getQueryKey(document.definitions[0]);
      const key2 = myegql.getQueryKey(document.definitions[1]);
      assert.equal(print(map[key1].transformedQuery), print(authorList));
      assert.equal(print(map[key2].transformedQuery), print(authorInfo));
    });

    it('should be able to handle a document with multiple queries', () => {
      const myegql = new ExtractGQL({ inputFilePath: 'empty' });
      const document = gql`query author {
        name
      }
      query person {
        name
      }`;
      const map = myegql.createMapFromDocument(document);
      assert.deepEqual(map, {
        [egql.getQueryKey(document.definitions[0])]: {
          transformedQuery: createDocumentFromQuery(document.definitions[0]),
          id: 1,
        },
        [egql.getQueryKey(document.definitions[1])]: {
          transformedQuery: createDocumentFromQuery(document.definitions[1]),
          id: 2,
        },
      });
    });
  });

  describe('queryTransformers', () => {
    it('should be able to transform a document before writing it to the output map', () => {
      const originalDocument = gql`
        query {
          author {
            firstName
            lastName
          }
        }
      `;
      const newDocument = gql`
        query {
          person {
            name
          }
        }
      `;
      const queryTransformer = (queryDef: OperationDefinition) => {
        return newDocument.definitions[0];
      };
      const myegql = new ExtractGQL({ inputFilePath: 'empty' });
      myegql.addQueryTransformer(queryTransformer);
      const map = myegql.createMapFromDocument(originalDocument);

      assert.deepEqual(map, {
        [egql.getQueryKey(originalDocument.definitions[0])]: {
          id: 1,
          transformedQuery: createDocumentFromQuery(newDocument.definitions[0]),
        },
      });
    });
  });

  describe('processGraphQLFile', () => {
    it('should be able to load a GraphQL file with multiple queries', (done) => {
      egql.processGraphQLFile('./test/fixtures/queries.graphql').then((documentMap) => {
        assert.equal(Object.keys(documentMap).length, 2);
        done();
      });
    });
  });

  describe('processInputFile', () => {
    it('should return an empty map on a file with an unknown extension', (done) => {
      egql.processInputFile('./test/fixtures/bad.c').then((documentMap) => {
        assert.deepEqual(documentMap, {});
        done();
      });
    });

    it('should correctly process a file with a .graphql extension', (done) => {
      egql.processInputFile('./test/fixtures/queries.graphql').then((result: OutputMap) => {
        assert.equal(Object.keys(result).length, 2);
        assert.equal(
          print(result[keys[0]].transformedQuery),
          print(createDocumentFromQuery(queries.definitions[0]))
        );
        assert.equal(
          print(result[keys[1]].transformedQuery),
          print(createDocumentFromQuery(queries.definitions[1]))
        );
        done();
      });
    });
  });

  describe('processInputPath', () => {
    it('should process a single file', (done) => {
      egql.processInputPath('./test/fixtures/queries.graphql').then((result: OutputMap) => {
        assert.equal(Object.keys(result).length, 2);
        assert.equal(
          print(result[keys[0]].transformedQuery),
          print(createDocumentFromQuery(queries.definitions[0]))
        );
        assert.equal(
          print(result[keys[1]].transformedQuery),
          print(createDocumentFromQuery(queries.definitions[1]))
        );
        done();
      });
    });

    it('should process a directory with a single file', (done) => {
      egql.processInputPath('./test/fixtures').then((result: OutputMap) => {
        assert.equal(Object.keys(result).length, 2);
        assert.equal(
          print(result[keys[0]].transformedQuery),
          print(createDocumentFromQuery(queries.definitions[0]))
        );
        assert.equal(
          print(result[keys[1]].transformedQuery),
          print(createDocumentFromQuery(queries.definitions[1]))
        );
        done();
      });
    });
  });

  describe('writeOutputMap', () => {
    it('should be able to write an OutputMap to a file', (done) => {
      const outputMap = egql.createMapFromDocument(queries);
      egql.writeOutputMap(outputMap, './test/output_tests/output.graphql').then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });
  });

  describe('trimDocumentForQuery', () => {
    it('should be able to trim a document for a no fragment query', () => {
      const document = gql`
        query {
          author {
            firstName
            lastName
          }
        }
        fragment uselessFragment on Author {
          firstName
          lastName
        }
      `;
      const trimmedQuery = egql.trimDocumentForQuery(document, document.definitions[0]);
      assert.deepEqual(print(trimmedQuery), print(gql`
        query {
          author {
            firstName
            lastName
          }
        }
      `));
    });

    it('should be able to trim a document for a single fragment query', () => {
      const document = gql`
        query {
          author {
            ...authorDetails on Author
          }
        }
        fragment authorDetails on Author {
          firstName
          lastName
        }
      `;
      assert.deepEqual(
        print(egql.trimDocumentForQuery(document, document.definitions[0])),
        print(document)
      );
    });

    it('should be able to trim a document for a nested fragment query', () => {
      const document = gql`
        query {
          author {
            ...authorDetails on Author
          }
        }
        fragment authorDetails on Author {
          firstName
          ...otherAuthorDetails on Author
        }
        fragment otherAuthorDetails on Author {
          lastName
        }
        fragment uselessFragment on Author {
          garbageFields
        }`;
      const minimalDocument = gql`
        query {
          author {
            ...authorDetails on Author
          }
        }
        fragment authorDetails on Author {
          firstName
          ...otherAuthorDetails on Author
        }
        fragment otherAuthorDetails on Author {
          lastName
        }
      `;
      assert.deepEqual(
        print(egql.trimDocumentForQuery(document, document.definitions[0])),
        print(minimalDocument)
      );
    });
  });
});
