import React, { Fragment } from 'react';
import {
  Badge,
  Bullseye,
  Button,
  EmptyState,
  Title,
  EmptyStateBody,
  EmptyStateVariant,
} from '@patternfly/react-core';
import { Link } from 'react-router-dom';
import {
  cellWidth,
  nowrap,
  sortable,
  SortByDirection,
} from '@patternfly/react-table';
import { EmptyTable } from '@redhat-cloud-services/frontend-components/EmptyTable';
import { ExportIcon, ExternalLinkSquareAltIcon } from '@patternfly/react-icons';
import { oneApi } from '../api';
import fileDownload from 'js-file-download';
import JSZip from 'jszip';
import flatten from 'lodash/flatten';
import { treeRow } from '@patternfly/react-table';

const indexToKey = ['', 'title', 'appName', 'version']; // pf indexes from 1 not 0

export const columns = (onSetRows, onRowSelected) => [
  {
    title: 'Application name',
    transforms: [sortable],
    cellTransforms: [...(onSetRows ? [treeRow(onSetRows, onRowSelected)] : [])],
  },
  { title: 'API endpoint', transforms: [nowrap, sortable, cellWidth(10)] },
  { title: 'API version', transforms: [nowrap, sortable, cellWidth(10)] },
  { title: 'Download', transforms: [cellWidth(10)] },
];

const constructParams = (url, github, config) => {
  const params = new URLSearchParams();
  url && params.set('url', url);
  if (github) {
    params.set('github-owner', github.owner);
    params.set('github-repo', github.repo);
    params.set('github-content', github.path);
  }
  Object.entries(config).forEach(([key, value]) => {
    value && params.set(key, value);
  });
  return params.toString();
};

export const rowMapper = (
  title,
  versions,
  url,
  github,
  selectedRows = [],
  apiName,
  config
) => ({
  selected:
    selectedRows?.[title]?.isSelected ||
    selectedRows?.[`parent-${title}`]?.isSelected,
  cells: [
    {
      title: (
        <Fragment>
          {versions || url || github ? (
            <Link
              to={`/${apiName}${
                versions && versions[0] && versions[0] !== 'v1'
                  ? `/${versions[0]}`
                  : ''
              }${
                url || github || Object.values(config).length > 0 ? '?' : ''
              }${constructParams(url, github, config)}`}
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </Fragment>
      ),
      value: title,
      props: {
        value: title,
        'data-position': 'title',
      },
    },
    versions
      ? `/api/${apiName}`
      : url
      ? {
          title: (
            <span className="ins-c-docs__url">
              {url.replace(/openapi$/, '').replace(/^http(?:s):\/\//, '')}
            </span>
          ),
          props: {
            colSpan: 2,
          },
          value: url,
        }
      : github
      ? {
          title: (
            <Fragment>
              <Button
                variant="link"
                isInline
                component="a"
                icon={<ExternalLinkSquareAltIcon />}
                target="_blank"
                rel="noopener noreferrer"
                iconPosition="right"
                href={`https://github.com/${github.owner}/${github.repo}`}
              >
                {github.owner}/{github.repo}
              </Button>
            </Fragment>
          ),
          props: {
            colSpan: 2,
          },
          value: github,
        }
      : '',
    ...(!url && !github
      ? [
          {
            title: (
              <Fragment>
                {versions?.map?.((version) => (
                  <Link key={version} to={`/${apiName}/${version}`}>
                    <Badge>{version}</Badge>
                  </Link>
                ))}
              </Fragment>
            ),
            value: versions,
          },
        ]
      : []),
    {
      title: (
        <Button
          variant="plain"
          onClick={() => downloadFile(apiName, versions?.[0], url, github)}
        >
          {' '}
          <ExportIcon />{' '}
        </Button>
      ),
    },
  ],
});

export const emptyTable = [
  {
    cells: [
      {
        title: (
          <EmptyTable>
            <Bullseye>
              <EmptyState variant={EmptyStateVariant.full}>
                <Title headingLevel="h5" size="lg">
                  No matching rules found
                </Title>
                <EmptyStateBody>
                  This filter criteria matches no rules. <br /> Try changing
                  your filter settings.
                </EmptyStateBody>
              </EmptyState>
            </Bullseye>
          </EmptyTable>
        ),
        props: {
          colSpan: 4,
        },
      },
    ],
  },
];

export function sortRows(curr, next, key = 'title', isDesc) {
  const getSortKey = (obj) =>
    key === 'appName' && obj.apiName ? 'apiName' : key;
  return isDesc
    ? next[getSortKey(next)]?.localeCompare(curr[getSortKey(curr)], 'en', {
        sensitivity: 'base',
      })
    : curr[getSortKey(curr)]?.localeCompare(next[getSortKey(next)], 'en', {
        sensitivity: 'base',
      });
}

export function buildRows(
  sortBy,
  { page, perPage },
  rows,
  selectedRows,
  openedRows
) {
  if (rows.length > 0) {
    let rowIndex = 0;
    return rows
      .sort((curr, next) =>
        sortRows(
          curr,
          next,
          indexToKey[sortBy.index],
          sortBy.direction === SortByDirection.desc
        )
      )
      .slice((page - 1) * perPage, page * perPage)
      .map(({ frontend, title, appName, version, apiName, api }, index) => {
        const row = [
          {
            ...rowMapper(
              title,
              api.versions,
              api.url,
              api.github,
              selectedRows,
              apiName || appName,
              { readonly: api.readonly }
            ),
            ...(api.subItems && {
              isTreeOpen: openedRows?.includes?.(
                (frontend && frontend.title) || title
              ),
              subItems: api.subItems,
            }),
            noDetail: !version && !api.url && !api.github,
            posinset: index + 1,
          },
          ...(api.subItems
            ? Object.entries(api.subItems).map(
                (
                  [key, { title, versions, url, apiName, github, readonly }],
                  subItemIndex
                ) => {
                  return {
                    ...rowMapper(
                      title,
                      versions,
                      url,
                      github,
                      selectedRows,
                      apiName || key,
                      { readonly }
                    ),
                    treeParent: rowIndex,
                    posinset: subItemIndex + 1,
                  };
                }
              )
            : []),
        ];
        rowIndex =
          rowIndex + (api.subItems ? Object.keys(api.subItems).length + 1 : 1);
        return row;
      })
      .flat();
  }

  return emptyTable;
}

export function filterRows(row, filter) {
  const restFilterValues = [
    row.frontend?.title,
    ...(row.frontend?.paths || []),
    // eslint-disable-next-line camelcase
    ...(row.frontend?.sub_apps?.reduce(
      (acc, curr) => [...acc, curr.title, curr.id],
      []
    ) || []),
    row.api?.apiName,
  ].filter(Boolean);
  return (
    indexToKey.some(
      (key) =>
        row[key] &&
        row[key].toLocaleLowerCase().indexOf(filter.toLocaleLowerCase()) !== -1
    ) ||
    restFilterValues.some(
      (value) =>
        value.toLocaleLowerCase().indexOf(filter.toLocaleLowerCase()) !== -1
    )
  );
}

export function downloadFile(appName, appVersion, url, github) {
  oneApi({
    name: appName,
    version: appVersion,
    url,
    github: { ...github, content: github?.path },
  }).then((data) => {
    delete data.latest;
    delete data.name;
    fileDownload(JSON.stringify(data), `${appName}-openapi.json`);
  });
}

export function multiDownload(selectedRows = {}, onError) {
  const zip = new JSZip();
  const allFiles = Object.values(selectedRows)
    .filter(({ isSelected }) => isSelected)
    .map(({ appName, version, apiName, subItems, url, github }) => {
      if (subItems) {
        return Object.entries(subItems).map(
          ([key, { versions, url, github }]) =>
            oneApi({ name: key, version: versions?.[0], url, github }).catch(
              () =>
                onError(
                  `API ${key} with version ${versions[0]} not found or broken.`
                )
            )
        );
      } else {
        return oneApi({ name: apiName || appName, version, url, github }).catch(
          () =>
            onError(
              `API ${
                apiName || appName
              } with version ${version} not found or broken.`
            )
        );
      }
    });

  Promise.all(flatten(allFiles)).then((files) => {
    if (files && files.length > 1) {
      files.map(({ name, ...file } = {}) => {
        if (name) {
          delete file.latest;
          zip.file(`${name}-openapi.json`, JSON.stringify(file));
        }
      });
      zip
        .generateAsync({ type: 'blob' })
        .then((content) => fileDownload(content, `cloud-services-openapi.zip`));
    } else if (files && files.length === 1) {
      const { name, ...file } = files[0] || {};
      if (name) {
        delete file.latest;
        fileDownload(JSON.stringify(file), `${name}-openapi.json`);
      }
    }
  });
}
