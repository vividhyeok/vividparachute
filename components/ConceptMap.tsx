import type { Concept } from '@/lib/types';
import { conceptOutline, conceptPaths } from '@/lib/concept-map';

type Props = {
  concepts: Concept[];
  onSelect: (id: string) => void;
  compact?: boolean;
  currentId?: string;
};

export default function ConceptMap({ concepts, onSelect, compact = false, currentId }: Props) {
  const groups = conceptPaths(concepts);
  return <div className={`concept-map${compact ? ' compact' : ''}`}>
    {groups.map((group, index) => <section className={`map-path map-${group.id}`} key={group.id} aria-label={group.label}>
      <div className="map-path-heading"><span className="map-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><p className="map-label">{group.label}</p><h2>{group.prompt}</h2></div></div>
      {!compact && <p className="map-route">{group.hint}</p>}
      <ul className="map-concepts">{group.concepts.map(concept => {
        const outline = conceptOutline(concept);
        return <li key={concept.id}>
          <button className="map-concept" onClick={() => onSelect(concept.id)} aria-current={currentId === concept.id ? 'page' : undefined}>
            <strong>{concept.title}</strong>
            <span className="map-takeaway">{outline.summary}</span>
            {!compact && outline.headings.length > 1 && <span className="map-outline">{outline.headings.join(' · ')}</span>}
          </button>
        </li>;
      })}</ul>
    </section>)}
  </div>;
}
