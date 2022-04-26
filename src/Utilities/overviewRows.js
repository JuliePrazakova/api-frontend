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
import { ExportIcon } from '@patternfly/react-icons';
import { oneApi } from '../api';
import fileDownload from 'js-file-download';
import JSZip from 'jszip';
import flatten from 'lodash/flatten';
import { treeTable } from '@redhat-cloud-services/frontend-components/TreeTable';

const indexToKey = ['', 'title', 'appName', 'version']; // pf indexes from 1 not 0

export const columns = (onSetRows) => [
  {
    title: 'Application name',
    transforms: [sortable],
    cellTransforms: [treeTable(onSetRows)],
  },
  { title: 'API endpoint', transforms: [nowrap, sortable, cellWidth(10)] },
  { title: 'API version', transforms: [nowrap, sortable, cellWidth(10)] },
  { title: 'Download', transforms: [cellWidth(10)] },
];

export const rowMapper = (
  title,
  versions,
  url,
  selectedRows = [],
  apiName
) => ({
  selected: selectedRows?.[title]?.isSelected,
  cells: [
    {
      title: (
        <Fragment>
          {versions || url ? (
            <Link
              to={`/${apiName}${
                versions && versions[0] !== 'v1'
                  ? `/${apiName}/${versions[0] || ''}`
                  : ''
              }${url ? `?url=${url}` : ''}`}
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
      ? { title: <span className="ins-c-docs__url">{url}</span>, value: url }
      : '',
    {
      title: (
        <Fragment>
          {versions &&
            versions.map((version) => (
              <Link key={version} to={`/${apiName}/${version}`}>
                <Badge>{version}</Badge>
              </Link>
            ))}
        </Fragment>
      ),
      value: versions,
    },
    {
      title: (
        <Button
          variant="plain"
          onClick={() => downloadFile(apiName, versions?.[0], url)}
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
      .map(({ frontend, title, appName, version, apiName, api }, index) => [
        {
          ...rowMapper(
            title,
            api.versions,
            api.url,
            selectedRows,
            apiName || appName
          ),
          ...(api.subItems && {
            isTreeOpen: openedRows?.includes?.(
              (frontend && frontend.title) || title
            ),
            subItems: api.subItems,
          }),
          noDetail: !version && !api.url,
        },
        ...(api.subItems
          ? Object.entries(api.subItems).map(
              ([key, { title, versions, url, apiName }]) => ({
                ...rowMapper(
                  title,
                  versions,
                  url,
                  selectedRows,
                  apiName || key
                ),
                treeParent: index,
              })
            )
          : []),
      ])
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

export function downloadFile(appName, appVersion, url) {
  oneApi({ name: appName, version: appVersion, url }).then((data) => {
    delete data.latest;
    delete data.name;
    fileDownload(JSON.stringify(data), `${appName}-openapi.json`);
  });
}

export function multiDownload(selectedRows = {}, onError) {
  const zip = new JSZip();
  const allFiles = Object.values(selectedRows)
    .filter(({ isSelected }) => isSelected)
    .map(({ appName, version, apiName, subItems, url }) => {
      if (subItems) {
        return Object.entries(subItems).map(([key, { versions, url }]) =>
          oneApi({ name: key, version: versions?.[0], url }).catch(() =>
            onError(
              `API ${key} with version ${versions[0]} not found or broken.`
            )
          )
        );
      } else {
        return oneApi({ name: apiName || appName, version, url }).catch(() =>
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
