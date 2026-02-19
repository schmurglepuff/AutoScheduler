import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface PersonNoteEntry {
  person_name: string;
  note_text: string;
}

interface PersonNoteInputProps {
  notes: PersonNoteEntry[];
  onChange: (notes: PersonNoteEntry[]) => void;
}

export function PersonNoteInput({ notes, onChange }: PersonNoteInputProps) {
  const addNote = () => {
    onChange([...notes, { person_name: '', note_text: '' }]);
  };

  const removeNote = (index: number) => {
    onChange(notes.filter((_, i) => i !== index));
  };

  const updateNote = (index: number, field: keyof PersonNoteEntry, value: string) => {
    const updated = notes.map((n, i) => (i === index ? { ...n, [field]: value } : n));
    onChange(updated);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">People Notes</label>
      {notes.map((note, i) => (
        <div key={i} className="flex gap-2 items-start">
          <Input
            placeholder="Person name"
            value={note.person_name}
            onChange={(e) => updateNote(i, 'person_name', e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Note"
            value={note.note_text}
            onChange={(e) => updateNote(i, 'note_text', e.target.value)}
            className="flex-2"
          />
          <Button variant="ghost" size="sm" onClick={() => removeNote(i)}>
            &times;
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={addNote} className="self-start">
        + Add Person Note
      </Button>
    </div>
  );
}
