/**
 * The slice of the content-manager's plugin API this plugin calls.
 *
 * Strapi types `Plugin.apis` as `Record<string, unknown>`, so extending another
 * plugin requires asserting a shape. The real types do exist, in
 * `@strapi/content-manager/strapi-admin` - but that package is not a
 * dependency of this one. It is only present because Strapi bundles it, and
 * importing it directly would be an undeclared dependency: exactly what
 * scripts/check-undeclared-deps.cjs exists to catch, and exactly the class of
 * breakage behind #128.
 *
 * So this describes only the two functions actually called. It is narrower than
 * the upstream contract by design: if either signature changes, this is the one
 * place to update.
 */

/** Context the content-manager passes to an edit-view contribution. */
export interface EditViewContext {
  /** Null only when the content type does not have draft & publish enabled. */
  activeTab?: 'draft' | 'published' | null;
  /** 'single-types' or 'collection-types'. */
  collectionType?: string;
  /** Undefined while an entry is being created. */
  document?: { documentId?: string } & Record<string, unknown>;
  /** Undefined while an entry is being created. */
  documentId?: string;
  meta?: unknown;
  /** The current content type's uid. */
  model: string;
}

/**
 * A content-manager contribution is a *description* component.
 *
 * It is called like a component and may use hooks, but it returns a plain
 * object describing a control - a label, an icon, a dialog - rather than JSX.
 * The content-manager renders that description itself.
 *
 * Typing these as React's `ComponentType` compiles right up until the return
 * type is checked, because a description object is not a valid ReactNode.
 * Returning null means "do not contribute anything here", which is how both of
 * this plugin's contributions hide themselves for uncached content types.
 */
export type DescriptionComponent<Props, Description extends object = object> = (
  props: Props
) => Description | null;

export interface ContentManagerApis {
  addDocumentAction(actions: DescriptionComponent<EditViewContext>[]): void;
  addEditViewSidePanel(panels: DescriptionComponent<EditViewContext>[]): void;
}
