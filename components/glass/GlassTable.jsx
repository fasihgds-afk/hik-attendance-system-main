'use client';

import { useTheme } from '@/lib/theme/ThemeContext';
import { getTableStyles } from '@/lib/theme/styles';

/**
 * GlassTable — opaque wrapper + solid rows via getTableStyles().
 */

function GlassTableRoot({ children, className = '', style }) {
  const { colors } = useTheme();
  const tableStyles = getTableStyles(colors);

  return (
    <div
      className={`table-responsive glass-table-wrapper ${className}`.trim()}
      style={{
        ...tableStyles.wrapper,
        ...style,
      }}
    >
      <table
        className="glass-table daily-table hr-att-table"
        style={tableStyles.table}
      >
        {children}
      </table>
    </div>
  );
}

function GlassTableHead({ children, className = '' }) {
  return <thead className={className}>{children}</thead>;
}

function GlassTableBody({ children, className = '' }) {
  return <tbody className={className}>{children}</tbody>;
}

function GlassTableRow({ children, even = false, className = '', style }) {
  const { colors } = useTheme();
  const tableStyles = getTableStyles(colors);
  const defaultBg = even ? tableStyles.trEven.backgroundColor : tableStyles.tr.backgroundColor;

  return (
    <tr
      className={className}
      style={{
        ...tableStyles.tr,
        backgroundColor: defaultBg,
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = tableStyles.trHover.backgroundColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = defaultBg;
      }}
    >
      {children}
    </tr>
  );
}

function GlassTableHeaderCell({ children, className = '', style, align = 'left' }) {
  const { colors } = useTheme();
  const { th } = getTableStyles(colors);

  return (
    <th
      className={className}
      style={{
        ...th,
        textAlign: align,
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function GlassTableCell({ children, className = '', style, align = 'left' }) {
  const { colors } = useTheme();
  const { td } = getTableStyles(colors);

  return (
    <td
      className={className}
      style={{
        ...td,
        textAlign: align,
        backgroundColor: 'transparent',
        ...style,
      }}
    >
      {children}
    </td>
  );
}

const GlassTable = Object.assign(GlassTableRoot, {
  Head: GlassTableHead,
  Body: GlassTableBody,
  Row: GlassTableRow,
  Th: GlassTableHeaderCell,
  Td: GlassTableCell,
});

export default GlassTable;
