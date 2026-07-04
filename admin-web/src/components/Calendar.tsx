import { useState } from 'react';

interface CalendarEvent {
  date: Date;
  title: string;
  type?: 'job' | 'deadline' | 'event' | 'reminder';
}

interface CalendarProps {
  events?: CalendarEvent[];
  onDateSelect?: (date: Date) => void;
}

export function Calendar({ events = [], onDateSelect }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());

  const days = [];
  const current = new Date(startDate);
  while (days.length < 42) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const eventsByDate = events.reduce(
    (acc, event) => {
      const key = event.date.toDateString();
      if (!acc[key]) acc[key] = [];
      acc[key].push(event);
      return acc;
    },
    {} as Record<string, CalendarEvent[]>,
  );

  const typeColors: Record<string, string> = {
    job: 'var(--info)',
    deadline: 'var(--danger)',
    event: 'var(--success)',
    reminder: 'var(--warning)',
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        width: '100%',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{monthName}</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={previousMonth}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--surface-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '0.375rem',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: '0.875rem',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'var(--accent)';
              e.currentTarget.style.color = 'var(--accent-contrast)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'var(--surface-secondary)';
              e.currentTarget.style.color = 'var(--text)';
            }}
          >
            ← Prev
          </button>
          <button
            onClick={nextMonth}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--surface-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '0.375rem',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: '0.875rem',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'var(--accent)';
              e.currentTarget.style.color = 'var(--accent-contrast)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'var(--surface-secondary)';
              e.currentTarget.style.color = 'var(--text)';
            }}
          >
            Next →
          </button>
        </div>
      </div>

      {/* Weekday labels */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '0.5rem',
          marginBottom: '0.5rem',
        }}
      >
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div
            key={day}
            style={{
              textAlign: 'center',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--text-muted)',
              padding: '0.5rem',
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '0.5rem',
        }}
      >
        {days.map((day, i) => {
          const dateStr = day.toDateString();
          const dayEvents = eventsByDate[dateStr] || [];
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          const isToday = new Date().toDateString() === dateStr;

          return (
            <div
              key={i}
              onClick={() => onDateSelect?.(day)}
              style={{
                minHeight: '80px',
                padding: '0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '0.375rem',
                background: isCurrentMonth ? 'var(--surface)' : 'var(--surface-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                opacity: isCurrentMonth ? 1 : 0.5,
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.background = isCurrentMonth ? 'var(--surface)' : 'var(--surface-secondary)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div
                style={{
                  fontSize: '0.875rem',
                  fontWeight: isToday ? 'bold' : 'normal',
                  marginBottom: '0.25rem',
                  padding: isToday ? '0.25rem 0.5rem' : 0,
                  background: isToday ? 'var(--accent)' : 'transparent',
                  color: isToday ? 'var(--accent-contrast)' : 'var(--text)',
                  borderRadius: '0.25rem',
                  display: 'inline-block',
                  minWidth: '20px',
                  textAlign: 'center',
                }}
              >
                {day.getDate()}
              </div>

              {/* Event indicators */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {dayEvents.slice(0, 3).map((event, j) => (
                  <div
                    key={j}
                    style={{
                      fontSize: '0.65rem',
                      padding: '2px 4px',
                      background: typeColors[event.type || 'event'],
                      color: 'white',
                      borderRadius: '0.2rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={event.title}
                  >
                    {event.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
