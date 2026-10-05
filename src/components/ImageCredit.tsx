import sources from '../../assets/sources.json';

export default function ImageCredit({ filename }: { filename: string }) {
  const source = sources.find((image) => image.filename === filename);
  if (!source) throw new Error(`Missing image credit for ${filename}`);

  return (
    <figcaption className="image-credit">
      <span>Image:</span>{' '}
      <a href={source.artist_page} target="_blank" rel="noreferrer" aria-label={`${source.artist_name} on Unsplash (opens in a new tab)`}>{source.artist_name}</a>
      <span aria-hidden="true"> / </span>
      <a href={source.url} target="_blank" rel="noreferrer" aria-label={`${source.filename.replace(/\.jpg$/, '')} on Unsplash (opens in a new tab)`}>Unsplash</a>
    </figcaption>
  );
}
