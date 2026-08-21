export default function merge(target, ...sources) {
  const isObject = (obj) => obj && typeof obj === 'object' && !Array.isArray(obj);

  if (!sources.length) return target;

  const source = sources.shift();

  if (!isObject(target) || !isObject(source)) {
    return source;
  }

  Object.keys(source).forEach(key => {
    const targetValue = target[key];
    const sourceValue = source[key];

    if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      target[key] = targetValue.concat(sourceValue);
    } else if (isObject(targetValue) && isObject(sourceValue)) {
      target[key] = merge(Object.assign({}, targetValue), sourceValue);
    } else {
      target[key] = sourceValue;
    }
  });

  return merge(target, ...sources);
}